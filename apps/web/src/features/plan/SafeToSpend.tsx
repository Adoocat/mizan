import { moneyFromDto, type PlanResponse } from '@mizan/contracts'
import { decimal, formatMoney } from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { ExplainPopover, type ExplainRow } from '../../components/finance/ExplainPopover'
import { MoneyText } from '../../components/finance/MoneyText'
import { ProgressBar } from '../../components/finance/Progress'
import { Panel } from '../../components/ui/Panel'
import { useNumberLocale } from '../../lib/use-locale'

/**
 * The number the app exists to answer (PLAN §10, and the mockup's hero panel).
 *
 * It shows its work: the pool, what has gone from it, anything overspent elsewhere that is not
 * yet covered, and the days it is divided by. An uncovered overspend lowers this figure as soon
 * as it happens (decision D4), so being able to see why is not optional.
 */
export function SafeToSpend({ plan }: { plan: PlanResponse }) {
  const { t } = useTranslation()
  const locale = useNumberLocale()
  const spend = plan.spend

  const poolBudget = moneyFromDto(spend.poolBudget)
  const poolSpent = moneyFromDto(spend.poolSpent)
  const overspent = moneyFromDto(spend.uncoveredOverspend)
  const overAllocated = moneyFromDto(spend.overAllocated)
  const available = moneyFromDto(spend.availableToSpend)
  const safeToday = moneyFromDto(spend.safeToday)
  const spentToday = moneyFromDto(spend.spentToday)
  const remainingToday = moneyFromDto(spend.remainingToday)

  const rows: ExplainRow[] = [
    { label: t('spend.explain.pool'), value: poolBudget },
    { label: t('spend.explain.spent'), value: poolSpent, negative: true },
    ...(overspent.isZero()
      ? []
      : [{ label: t('spend.explain.overspent'), value: overspent, negative: true }]),
    ...(overAllocated.isZero()
      ? []
      : [{ label: t('spend.explain.overAllocated'), value: overAllocated, negative: true }]),
    { label: t('spend.explain.left'), value: available, total: true },
  ]

  const usedRatio = safeToday.isZero()
    ? decimal(spentToday.isPositive() ? 1 : 0)
    : spentToday.amount.dividedBy(safeToday.amount)

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {t('spend.title')}
          <ExplainPopover
            title={t('spend.title')}
            rows={rows}
            divisor={t('spend.explain.divide', { count: spend.daysLeft })}
            result={{ label: t('spend.explain.aDay'), value: safeToday }}
            note={t('spend.explain.note')}
          />
        </span>
      }
      meta={t('spend.meta', { count: spend.daysLeft })}
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-1">
          <span className="text-page-display text-ink">
            <MoneyText value={safeToday} fractionDigits="none" />
          </span>
          <span className="text-caption text-ink-3">{t('spend.aDay')}</span>
        </div>
        <div className="flex flex-col gap-1 text-right">
          <span className="text-value-s text-ink">
            <MoneyText value={available} fractionDigits="none" />
          </span>
          <span className="text-caption text-ink-3">{t('spend.leftThisMonth')}</span>
        </div>
      </div>

      <div className="flex max-w-[480px] flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3 text-body">
          <span className="text-ink-2">
            <MoneyText value={spentToday} fractionDigits="none" /> {t('spend.spentToday')}
          </span>
          <span className={remainingToday.isNegative() ? 'text-negative' : 'font-medium text-ink'}>
            <MoneyText value={remainingToday} tone="overspent" fractionDigits="none" />{' '}
            {t('spend.leftToday')}
          </span>
        </div>
        <ProgressBar
          value={usedRatio}
          tone={remainingToday.isNegative() ? 'negative' : 'warning'}
          label={t('spend.todayAllowance')}
        />
        <p className="m-0 text-caption text-ink-3">
          {spend.daysLeft === 0 ? t('spend.periodOver') : t('spend.carryNote')}
        </p>
      </div>

      {!overspent.isZero() && (
        <p className="m-0 text-caption text-warning">
          {t('spend.overspentNote', {
            amount: formatMoney(overspent, locale, { fractionDigits: 'none' }),
          })}
        </p>
      )}
    </Panel>
  )
}
