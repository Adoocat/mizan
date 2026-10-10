import { moneyFromDto, type PlanChildRowDto } from '@mizan/contracts'
import {
  budgetStatus,
  budgetUsage,
  decimal,
  Money,
  planLineAvailable,
  type Decimal,
} from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { CurrencyInput } from '../../components/finance/CurrencyInput'
import { MoneyText } from '../../components/finance/MoneyText'
import { ProgressBar } from '../../components/finance/Progress'
import { cn } from '../../lib/cn'

/** Category | Budgeted | Spent | Remaining, the four columns of the plan table. */
export const planGridClass = 'grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-x-4'

export interface PlanRowProps {
  row: PlanChildRowDto
  name: string
  /** The amount being typed, if any. It wins over the stored one while the field has focus. */
  draft: Money | null | undefined
  onDraft: (value: Money | null) => void
  onCommit: () => void
  onRevert: () => void
  /** Elapsed share of the period, for the expected-pace marker (§16). */
  pace: Decimal
  disabled?: boolean
  /** A subcategory is shown indented under its parent. */
  indented?: boolean
  saving?: boolean
  /** Offered on an overspent row: records which line paid for the overspend (§10). */
  onCover?: (() => void) | undefined
  /** Undoes the cover recorded against this row. */
  onUndoCover?: (() => void) | undefined
}

const RATIO_FULL = decimal(1)

/**
 * One line of the plan, with its allocation edited in place (flow F3).
 *
 * The amount is typed straight into the row and saved when the field is left; while it is being
 * typed the figures beside it — remaining, the progress bar — are recomputed with the same domain
 * functions the API uses, so the preview is the answer (§16).
 *
 * A row the pool or a parent category covers has no amount of its own to edit. It still shows
 * what was spent on it, because that is the question it answers: where the pool went.
 */
export function PlanLineRow({
  row,
  name,
  draft,
  onDraft,
  onCommit,
  onRevert,
  pace,
  disabled = false,
  indented = false,
  saving = false,
  onCover,
  onUndoCover,
}: PlanRowProps) {
  const { t } = useTranslation()

  const stored = moneyFromDto(row.planned)
  /*
   * An empty field is a draft of `null`, which means "no allocation" — not "show me the stored
   * amount again". Only the absence of a draft falls back to what was saved, or clearing the
   * field would undo itself on the next keystroke.
   */
  const editingValue = draft === undefined ? stored : draft
  const planned = editingValue ?? Money.zero(stored.currency)
  const actual = moneyFromDto(row.actual)
  const carryIn = moneyFromDto(row.carryIn)
  const covered = row.coveredBy !== null
  /*
   * A covered row has no amount of its own — until the user asks for one. Clicking "from pool"
   * starts a draft, which is what turns the row into a field; typing an amount into it gives the
   * category its own line and takes it out of the pool (§10).
   */
  const claiming = covered && draft !== undefined

  const movesIn = moneyFromDto(row.movesIn)
  const movesOut = moneyFromDto(row.movesOut)
  const figures = { planned, carryIn, movesIn, movesOut, actual }
  const available = covered ? Money.zero(planned.currency) : planLineAvailable(figures)
  const usage = covered ? null : budgetUsage(figures)
  // The pool or the parent carries a covered row, so it is never the one that is over.
  const status = covered ? 'onPace' : budgetStatus(figures, pace)

  return (
    <div
      data-testid="plan-row"
      data-status={status}
      className={cn(
        planGridClass,
        'mx-3 items-center rounded-control px-4 py-2 text-body hover:bg-inset',
        indented && 'ml-9',
      )}
    >
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate text-ink-2">{name}</span>
          {row.rollover && (
            <span className="shrink-0 text-caption text-accent">{t('plan.rolloverOn')}</span>
          )}
          {!movesIn.isZero() && (
            <span className="shrink-0 text-caption text-accent">
              {t('plan.coveredIn')} <MoneyText value={movesIn} fractionDigits="none" />
              {onUndoCover && !disabled && (
                <button
                  type="button"
                  onClick={onUndoCover}
                  className="ml-1.5 cursor-pointer border-0 bg-transparent p-0 text-caption text-ink-3 hover:underline"
                >
                  {t('common.undo')}
                </button>
              )}
            </span>
          )}
          {!movesOut.isZero() && (
            <span className="shrink-0 text-caption text-ink-3">
              {t('plan.coveredOut')} <MoneyText value={movesOut} fractionDigits="none" />
            </span>
          )}
          {status === 'over' && onCover && !disabled && (
            <button
              type="button"
              aria-label={t('plan.coverFor', { name })}
              onClick={onCover}
              className="shrink-0 cursor-pointer rounded-full border border-border-strong bg-surface px-2.5 py-0.5 text-caption text-ink-2 hover:border-border-hover hover:text-ink"
            >
              {t('plan.cover')}
            </button>
          )}
        </span>
        <ProgressBar
          className="max-w-[260px]"
          value={usage ?? (!covered && actual.isPositive() ? RATIO_FULL : decimal(0))}
          marker={pace}
          tone={status === 'over' ? 'negative' : 'pace'}
          label={`${name}: ${t(`budget.status.${status}`)}`}
        />
      </span>

      <span className="flex justify-end text-right">
        {covered && !claiming ? (
          disabled ? (
            <span className="text-caption text-ink-3">
              {t(row.coveredBy === 'pool' ? 'plan.fromPool' : 'plan.fromParent')}
            </span>
          ) : (
            <button
              type="button"
              // Giving it a line is the point of the row, so the label says what it is now and
              // the button says what pressing it does.
              aria-label={t('plan.giveItsOwnLine', { name })}
              onClick={() => onDraft(Money.zero(stored.currency))}
              className="cursor-pointer border-0 bg-transparent p-0 text-caption text-ink-3 hover:text-accent hover:underline"
            >
              {t(row.coveredBy === 'pool' ? 'plan.fromPool' : 'plan.fromParent')}
            </button>
          )
        ) : (
          <CurrencyInput
            compact
            className="w-full max-w-[150px]"
            label={t('plan.allocationFor', { name })}
            value={editingValue}
            autoFocus={claiming}
            disabled={disabled || saving}
            onChange={onDraft}
            onBlur={onCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              // Escape puts the saved amount back and keeps the focus. Blurring here would
              // instead run the commit below with the draft this render still closes over.
              if (event.key === 'Escape') onRevert()
            }}
          />
        )}
      </span>

      <span className="text-right text-ink-2">
        <MoneyText value={actual} fractionDigits="none" />
      </span>

      <span className="text-right">
        {covered ? (
          <span className="text-ink-3">—</span>
        ) : (
          <MoneyText value={available} tone="overspent" fractionDigits="none" />
        )}
      </span>
    </div>
  )
}
