import { moneyFromDto, type PlanChildRowDto, type PlanResponse } from '@mizan/contracts'
import {
  addDays,
  formatMoney,
  isPlainDate,
  Money,
  periodContaining,
  planLineAvailable,
  planLineOverspend,
} from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { useNumberLocale } from '../../lib/use-locale'
import { useCurrentSession } from '../auth/session'
import { useCategories } from '../categories/api'
import { useCategoryName } from '../categories/names'
import { usePlan } from '../plan/api'

interface BudgetImpactPreviewProps {
  /** The parts being entered: a category and a magnitude. */
  parts: readonly { categoryId: string | null; amount: Money | null }[]
  /** The date on the form. Only spending inside the current plan month is previewed. */
  date: string
  /** An expense is the only kind that spends from the plan. */
  kind: 'expense' | 'income' | 'transfer'
  /** Off-budget spending never touches the plan (§10). */
  onBudget: boolean
}

const figuresOf = (row: PlanChildRowDto) => ({
  planned: moneyFromDto(row.planned),
  carryIn: moneyFromDto(row.carryIn),
  movesIn: moneyFromDto(row.movesIn),
  movesOut: moneyFromDto(row.movesOut),
  actual: moneyFromDto(row.actual),
})

/**
 * What this expense would do to the plan, before it is saved (flow F4, and the mockup's "Dining
 * out pool ₺3,000 → ₺2,915 · today's allowance ₺215 → ₺130").
 *
 * Every figure comes from the same domain functions the API uses, applied to the plan the page
 * already has — so the preview is the arithmetic, not a guess at it. It is only shown for money
 * the plan can see: an on-budget expense dated inside the month being planned.
 */
export function BudgetImpactPreview({ parts, date, kind, onBudget }: BudgetImpactPreviewProps) {
  const { t } = useTranslation()
  const locale = useNumberLocale()
  const session = useCurrentSession()
  /*
   * The plan for the month the date falls in, not necessarily the current one: a backdated
   * expense belongs to the month it is dated in, and that is the plan it would change.
   */
  const month = isPlainDate(date)
    ? periodContaining(date, session.workspace.periodStartDay).start
    : null
  const plan = usePlan(month)
  const categories = useCategories(true)
  const categoryName = useCategoryName()

  const data = plan.data
  const relevant = kind === 'expense' && onBudget
  if (!relevant || !data || date < data.period.start || date >= data.period.end) return null

  const rows = data.groups.flatMap((group) => group.rows.flatMap((row) => [row, ...row.children]))
  const poolRow = rows.find((row) => row.target === 'pool')
  if (!poolRow) return null

  const base = moneyFromDto(data.spend.availableToSpend).currency
  const amounts = parts.filter(
    (part): part is { categoryId: string | null; amount: Money } =>
      part.amount !== null && part.amount.isPositive(),
  )
  if (amounts.length === 0) return null

  /** The row that answers for a category: itself, its parent, or the pool (§10). */
  const answeringRow = (categoryId: string | null): PlanChildRowDto => {
    const row = categoryId === null ? undefined : rows.find((one) => one.categoryId === categoryId)
    if (!row || row.coveredBy === 'pool') return poolRow
    if (row.coveredBy === 'parent') {
      const parent = data.groups
        .flatMap((group) => group.rows)
        .find((one) => one.children.some((child) => child.categoryId === categoryId))
      return parent ?? poolRow
    }
    return row
  }

  /** The spend per answering row, so two parts of one split against one line add up. */
  const byRow = new Map<string, { row: PlanChildRowDto; amount: Money }>()
  for (const part of amounts) {
    const row = answeringRow(part.categoryId)
    const key = row.categoryId ?? 'pool'
    const current = byRow.get(key)
    byRow.set(key, {
      row,
      amount: current ? current.amount.plus(part.amount) : part.amount,
    })
  }

  const name = (row: PlanChildRowDto): string => {
    if (row.target === 'pool') return t('plan.poolLine')
    const category = categories.data?.groups
      .flatMap((group) => group.categories)
      .find((one) => one.id === row.categoryId)
    return category ? categoryName(category) : t('plan.uncategorized')
  }

  const money = (value: Money) => formatMoney(value, locale, { fractionDigits: 'none' })

  /*
   * How much of this would come off what can be spent: all of it when the pool answers for the
   * category, and only the part that goes over the line when the category has one of its own
   * (decision D4).
   */
  let atsDrop = Money.zero(base)
  const lines = [...byRow.values()].map(({ row, amount }) => {
    const figures = figuresOf(row)
    const after = { ...figures, actual: figures.actual.plus(amount) }

    atsDrop =
      row.target === 'pool'
        ? atsDrop.plus(amount)
        : atsDrop.plus(planLineOverspend(after).minus(planLineOverspend(figures)))

    return {
      key: row.categoryId ?? 'pool',
      text: t('transactions.impact.line', {
        name: name(row),
        before: money(planLineAvailable(figures)),
        after: money(planLineAvailable(after)),
      }),
    }
  })

  const remaining = moneyFromDto(data.spend.remainingToday)
  const showAllowance = date === todayOf(data) && !atsDrop.isZero()

  return (
    <p className="m-0 text-caption text-ink-2" data-testid="budget-impact">
      {lines.map((line) => line.text).join(' · ')}
      {showAllowance && (
        <>
          {' · '}
          {t('transactions.impact.allowance', {
            before: money(remaining),
            after: money(remaining.minus(atsDrop)),
          })}
        </>
      )}
    </p>
  )
}

/**
 * Today, as the plan sees it: the period's start plus the days that have elapsed. The API is the
 * authority on what day it is in the workspace's time zone, not the browser.
 */
const todayOf = (plan: PlanResponse): string => addDays(plan.period.start, plan.period.daysElapsed)
