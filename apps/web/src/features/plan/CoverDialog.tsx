import {
  moneyFromDto,
  type CoverOverspendInput,
  type PlanChildRowDto,
  type PlanResponse,
} from '@mizan/contracts'
import { formatMoney, Money, planLineAvailable, suggestedCover } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { MoneyText } from '../../components/finance/MoneyText'
import { Button } from '../../components/ui/Button'
import { Dialog, DialogContent } from '../../components/ui/Dialog'
import { SelectField } from '../../components/ui/Field'
import { useNumberLocale } from '../../lib/use-locale'

/** A row the money could come from: it answers for itself and has something left. */
export interface CoverSource {
  row: PlanChildRowDto
  name: string
  available: Money
}

/** The figures the domain needs from a row, as the API sent them. */
const figuresOf = (row: PlanChildRowDto) => ({
  planned: moneyFromDto(row.planned),
  carryIn: moneyFromDto(row.carryIn),
  movesIn: moneyFromDto(row.movesIn),
  movesOut: moneyFromDto(row.movesOut),
  actual: moneyFromDto(row.actual),
})

/**
 * Every row that could pay for an overspend.
 *
 * Lines come before the pool, richest first. The point of covering is to move money that was set
 * aside for something that no longer needs it; taking it from the pool is where it has come from
 * already (decision D4), so it is offered last rather than first.
 */
export function coverSources(
  plan: PlanResponse,
  target: PlanChildRowDto,
  nameOf: (row: PlanChildRowDto) => string,
): CoverSource[] {
  const key = (row: PlanChildRowDto) => row.categoryId ?? 'pool'
  return plan.groups
    .flatMap((group) => group.rows.flatMap((row) => [row, ...row.children]))
    .filter((row) => row.coveredBy === null && key(row) !== key(target))
    .map((row) => ({ row, name: nameOf(row), available: planLineAvailable(figuresOf(row)) }))
    .filter((source) => source.available.isPositive())
    .sort((a, b) => poolLast(a.row) - poolLast(b.row) || b.available.compare(a.available))
}

interface CoverDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The overspent row the money is going to. */
  target: PlanChildRowDto
  targetName: string
  sources: CoverSource[]
  pending: boolean
  onSubmit: (input: CoverOverspendInput) => void
}

/**
 * Covering an overspend (flow F5, §10).
 *
 * The overspend has already come off what can be spent (decision D4); this says which line paid
 * for it. The plan stays whole — the covered line gains exactly what the source loses — so the
 * dialog only offers lines that actually have the money, and never more than went over.
 */
export function CoverDialog({
  open,
  onOpenChange,
  target,
  targetName,
  sources,
  pending,
  onSubmit,
}: CoverDialogProps) {
  const { t } = useTranslation()
  const locale = useNumberLocale()
  const overspend = moneyFromDto(target.overspend)

  const [fromKey, setFromKey] = useState(() => sources[0] && keyOf(sources[0].row))
  const source = sources.find((one) => keyOf(one.row) === fromKey) ?? sources[0]

  const suggested = source
    ? suggestedCover({ source: figuresOf(source.row), target: figuresOf(target) })
    : Money.zero(overspend.currency)
  const [amount, setAmount] = useState<Money | null>(suggested)

  const canSubmit =
    source !== undefined &&
    amount !== null &&
    amount.isPositive() &&
    amount.lessThanOrEqual(overspend) &&
    amount.lessThanOrEqual(source.available)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('cover.title', { name: targetName })}
        description={t('cover.description')}
      >
        <p className="m-0 flex items-baseline justify-between gap-3 text-body">
          <span className="text-ink-2">{t('cover.overspentBy')}</span>
          <span className="font-medium text-negative">
            <MoneyText value={overspend} fractionDigits="none" />
          </span>
        </p>

        {sources.length === 0 ? (
          <p className="m-0 text-body text-ink-2">{t('cover.noSource')}</p>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!canSubmit || !source || amount === null) return
              onSubmit({
                from:
                  source.row.target === 'pool'
                    ? { target: 'pool' }
                    : { target: 'category', categoryId: source.row.categoryId! },
                to:
                  target.target === 'pool'
                    ? { target: 'pool' }
                    : { target: 'category', categoryId: target.categoryId! },
                amount: amount.toDto(),
              })
            }}
          >
            <SelectField
              label={t('cover.from')}
              value={fromKey ?? ''}
              options={sources.map((one) => ({
                value: keyOf(one.row),
                label: t('cover.sourceOption', {
                  name: one.name,
                  amount: formatMoney(one.available, locale, { fractionDigits: 'none' }),
                }),
              }))}
              onChange={(event) => {
                const next = sources.find((one) => keyOf(one.row) === event.target.value)
                setFromKey(event.target.value)
                if (next) {
                  setAmount(
                    suggestedCover({ source: figuresOf(next.row), target: figuresOf(target) }),
                  )
                }
              }}
            />
            <CurrencyInput
              label={t('cover.amount')}
              value={amount}
              onChange={setAmount}
              required
              {...(amount && amount.greaterThan(overspend)
                ? { hint: t('cover.tooMuch') }
                : source && amount && amount.greaterThan(source.available)
                  ? { hint: t('cover.tooMuchForSource') }
                  : {})}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={!canSubmit} loading={pending}>
                {t('cover.submit')}
              </Button>
              <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

const keyOf = (row: PlanChildRowDto): string => row.categoryId ?? 'pool'

/** Sort key that puts the pool after every other line. */
const poolLast = (row: PlanChildRowDto): number => (row.target === 'pool' ? 1 : 0)
