import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import type { UpcomingItem } from '../../lib/sample-data'

/**
 * The upcoming-payments list from the mockups: a date block, the payee with its category and
 * account, and the amount. Overdue and estimated items say so in their meta line.
 */
export function UpcomingList({ items }: { items: UpcomingItem[] }) {
  const { t } = useTranslation()
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map((item) => (
        <li
          key={item.id}
          className="mx-3 flex items-center gap-4 rounded-control px-4 py-3 hover:bg-inset"
        >
          <span
            aria-hidden
            className="flex w-9 flex-none flex-col items-center text-center leading-tight"
          >
            <span className="text-[10px] font-medium tracking-[0.06em] text-ink-3 uppercase">
              {t(`days.${item.dayOfWeek}`)}
            </span>
            <span
              className={`text-value-s ${item.state === 'overdue' ? 'text-negative' : 'text-ink'}`}
            >
              {item.day}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-body text-ink">{item.name}</span>
            <span className="truncate text-caption text-ink-3">
              {item.state === 'overdue' && (
                <span className="text-negative">
                  {t('upcoming.overdueDays', { count: item.overdueDays ?? 0 })} ·{' '}
                </span>
              )}
              {t(`categories.${item.categoryKey}`)} · {item.account}
              {item.state === 'estimated' && ` · ${t('upcoming.estimated')}`}
            </span>
          </span>
          <span className="flex-none text-body text-ink">
            <MoneyText value={item.amount} />
          </span>
        </li>
      ))}
    </ul>
  )
}
