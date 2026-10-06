import { Decimal, decimal, type Money } from '@mizan/domain'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

/** Clamps a ratio to [0, 1] and returns a CSS percentage, computed with Decimal (no floats). */
function percentWidth(ratio: Decimal): string {
  const clamped = Decimal.max(0, Decimal.min(1, ratio))
  return `${clamped.times(100).toDecimalPlaces(2).toFixed()}%`
}

export type ProgressTone = 'pace' | 'positive' | 'warning' | 'negative' | 'accent'

const BAR_TONES: Record<ProgressTone, string> = {
  pace: 'bg-pace',
  positive: 'bg-positive-bar',
  warning: 'bg-warning-bar',
  negative: 'bg-negative-bar',
  accent: 'bg-accent-strong',
}

interface ProgressBarProps {
  /** Filled share, 0–1. Values outside are clamped. */
  value: Decimal
  label: string
  tone?: ProgressTone
  /** Marks where spending is expected to be today (elapsed share of the period). */
  marker?: Decimal
  className?: string
}

export function ProgressBar({ value, label, tone = 'pace', marker, className }: ProgressBarProps) {
  const percent = Decimal.max(0, Decimal.min(1, value)).times(100).toDecimalPlaces(0).toFixed()
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number.parseInt(percent, 10)}
      className={cn('relative h-1.5 w-full rounded-bar bg-track', className)}
    >
      <div
        className={cn('h-full rounded-bar', BAR_TONES[tone])}
        style={{ width: percentWidth(value) }}
      />
      {marker && (
        <div
          aria-hidden
          data-testid="pace-marker"
          className="absolute -top-0.5 h-2.5 w-0.5 rounded-bar bg-ink"
          style={{ left: percentWidth(marker) }}
        />
      )}
    </div>
  )
}

export type BudgetStatus = 'onPace' | 'aheadOfPace' | 'over'

const STATUS_TONE: Record<BudgetStatus, ProgressTone> = {
  onPace: 'pace',
  aheadOfPace: 'warning',
  over: 'negative',
}

interface BudgetProgressProps {
  name: string
  spent: Money
  limit: Money
  /** Computed by the domain (Phase 6). The UI only displays it. */
  status: BudgetStatus
  /** Elapsed share of the period, 0–1, shown as the expected-pace marker. */
  expectedPace: Decimal
  /** Text after the name, e.g. "₺330 left" or "₺110 over". */
  note: ReactNode
}

/** A budget line: spent against its limit, coloured by status, with the expected-pace marker. */
export function BudgetProgress({
  name,
  spent,
  limit,
  status,
  expectedPace,
  note,
}: BudgetProgressProps) {
  const { t } = useTranslation()
  const ratio = limit.isZero()
    ? decimal(spent.isPositive() ? 1 : 0)
    : spent.amount.dividedBy(limit.amount)
  return (
    <div className="flex flex-col gap-1.5" data-status={status}>
      <div className="flex items-baseline justify-between gap-3 text-body">
        <span className="text-ink">{name}</span>
        <span
          className={cn(
            'text-caption',
            status === 'over' && 'text-negative',
            status === 'aheadOfPace' && 'text-warning',
            status === 'onPace' && 'text-ink-3',
          )}
        >
          {note}
        </span>
      </div>
      <ProgressBar
        value={ratio}
        marker={expectedPace}
        tone={STATUS_TONE[status]}
        label={`${name}: ${t(`budget.status.${status}`)}`}
      />
    </div>
  )
}
