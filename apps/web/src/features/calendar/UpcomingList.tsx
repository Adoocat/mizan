import { moneyFromDto, type OccurrenceDto } from '@mizan/contracts'
import { dayOfWeek, toParts, type PlainDate } from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/cn'
import { useClearOccurrenceException, useSkipOccurrence } from '../recurring/api'

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** The weekday abbreviation for a plain date, without going through a `Date`. */
function weekdayKey(date: PlainDate): string {
  // `dayOfWeek` is 1 = Monday, which is the order the keys are in.
  return WEEKDAY_KEYS[dayOfWeek(date) - 1] ?? 'mon'
}

/**
 * The actions one occurrence offers (flow F6): confirm it, or skip it.
 *
 * Confirming opens a dialog, because the amount is the thing worth checking — on an estimated
 * bill it is the figure that matters, and on a fixed one the date may have slipped. Skipping is
 * one tap and reversible, which is why it needs no confirmation of its own.
 */
function OccurrenceActions({
  occurrence,
  onConfirm,
}: {
  occurrence: OccurrenceDto
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const skip = useSkipOccurrence(occurrence.ruleId)
  const clear = useClearOccurrenceException(occurrence.ruleId)

  if (occurrence.state === 'posted') {
    return <span className="text-caption text-positive">{t('recurring.states.posted')}</span>
  }
  if (occurrence.state === 'skipped') {
    return (
      <Button
        variant="secondary"
        loading={clear.isPending}
        onClick={() => clear.mutate(occurrence.originalDate)}
      >
        {t('recurring.unskip')}
      </Button>
    )
  }

  return (
    <>
      <Button variant="primary" onClick={onConfirm}>
        {t('recurring.confirmAction')}
      </Button>
      <Button
        variant="secondary"
        loading={skip.isPending}
        onClick={() => skip.mutate(occurrence.originalDate)}
      >
        {t('recurring.skip')}
      </Button>
    </>
  )
}

/**
 * The upcoming-payments list from the mockups: a date block, the payee with its category and
 * account, and the amount (§13).
 *
 * The date shown is the **due** date — the day the money is actually expected, after the weekend
 * policy and any override — while every action addresses the occurrence by its series date, which
 * is what keeps "the 1st" the same occurrence whichever Friday it was paid on.
 */
export function UpcomingList({
  items,
  nameOf,
  categoryNameOf,
  onConfirm,
}: {
  items: readonly OccurrenceDto[]
  nameOf: (accountId: string) => string
  categoryNameOf: (categoryId: string | null) => string
  /**
   * Opens the confirm dialog. Omitted on the dashboard, which shows the list to be read rather
   * than acted on — the actions live on the page that owns them (§13).
   */
  onConfirm?: (occurrence: OccurrenceDto) => void
}) {
  const { t } = useTranslation()

  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map((item) => (
        <li
          key={`${item.ruleId}-${item.originalDate}`}
          className="mx-3 flex flex-wrap items-center gap-4 rounded-control px-4 py-3 hover:bg-inset"
        >
          <span
            aria-hidden
            className="flex w-9 flex-none flex-col items-center text-center leading-tight"
          >
            <span className="text-[10px] font-medium tracking-[0.06em] text-ink-3 uppercase">
              {t(`days.${weekdayKey(item.dueDate)}`)}
            </span>
            <span
              className={cn(
                'text-value-s',
                item.state === 'overdue' ? 'text-negative' : 'text-ink',
              )}
            >
              {toParts(item.dueDate).day}
            </span>
          </span>

          <span className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
            <span className="truncate text-body text-ink">{item.ruleName}</span>
            <span className="truncate text-caption text-ink-3">
              {item.state === 'overdue' && (
                <span className="text-negative">
                  {t('upcoming.overdueDays', { count: item.overdueDays })} ·{' '}
                </span>
              )}
              {item.kind === 'transfer'
                ? t('recurring.kinds.transfer')
                : categoryNameOf(item.categoryId)}{' '}
              · {nameOf(item.accountId)}
              {item.estimated && ` · ${t('upcoming.estimated')}`}
              {item.overridden && ` · ${t('recurring.overridden')}`}
            </span>
          </span>

          <span
            className={cn(
              'flex-none text-body',
              item.kind === 'income' ? 'text-positive' : 'text-ink',
            )}
          >
            {item.estimated && '~'}
            <MoneyText
              value={moneyFromDto(item.amount)}
              signDisplay={item.kind === 'income' ? 'always' : 'auto'}
            />
          </span>

          {onConfirm && (
            <span className="flex flex-none gap-2">
              <OccurrenceActions occurrence={item} onConfirm={() => onConfirm(item)} />
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
