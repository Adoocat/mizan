import { moneyFromDto } from '@mizan/contracts'
import { Money } from '@mizan/domain'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { EmptyState } from '../../components/ui/EmptyState'
import { Panel, panelLinkClass } from '../../components/ui/Panel'
import { Skeleton } from '../../components/ui/Skeleton'
import { useAccounts } from '../accounts/api'
import { useCurrentSession } from '../auth/session'
import { useCategories } from '../categories/api'
import { useCategoryOptions } from '../categories/names'
import { UpcomingList } from '../calendar/UpcomingList'
import { useUpcoming } from './api'

/** How many the dashboard shows before it stops being a summary (§13). */
const MAX_ROWS = 6

/**
 * "Coming up" on the dashboard: the next seven days of recurring money (PLAN §13).
 *
 * Read-only on purpose. Confirming a payment is a decision with an amount attached, and it
 * belongs on the page that owns it — the dashboard's job is to say that something is coming and
 * what checking will hold afterwards.
 *
 * The rest of the dashboard is still placeholder data until phase 11; this panel is wired now for
 * the same reason the goal panel was in phase 8 (ADR 0013): invented figures beside real ones are
 * worse than none.
 */
export function ComingUpPanel() {
  const { t } = useTranslation()
  const { workspace } = useCurrentSession()
  const { data, isPending } = useUpcoming(7)

  const accounts = useAccounts(true)
  const categories = useCategories()
  const categoryOptions = useCategoryOptions(categories.data)

  const nameOf = (accountId: string) =>
    accounts.data?.accounts.find((account) => account.id === accountId)?.name ?? ''
  const categoryNameOf = (categoryId: string | null) =>
    categoryId === null
      ? t('upcoming.noCategory')
      : (categoryOptions.find((option) => option.id === categoryId)?.label ?? '')

  const zero = Money.zero(workspace.baseCurrency)
  // Overdue first: something that was missed matters more than something that is coming.
  const items = data ? [...data.overdue, ...data.occurrences].slice(0, MAX_ROWS) : []

  return (
    <Panel
      title={t('home.comingUp')}
      meta={t('home.comingUpRange')}
      className="flex-1 basis-[22rem]"
      flush
      action={
        items.length > 0 ? (
          <span className="text-value-s text-ink">
            <MoneyText value={data ? moneyFromDto(data.dueTotal) : zero} fractionDigits="none" />
          </span>
        ) : undefined
      }
    >
      {isPending ? (
        <div role="status" aria-busy aria-label={t('common.loading')} className="px-7">
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-7">
          <EmptyState
            title={t('upcoming.nothingDueTitle')}
            description={t('upcoming.nothingDueBody', { days: 7 })}
          />
        </div>
      ) : (
        <>
          <UpcomingList items={items} nameOf={nameOf} categoryNameOf={categoryNameOf} />
          <div className="flex flex-wrap justify-between gap-3 px-7 text-caption text-ink-3">
            <span>{t('home.checkingAfter')}</span>
            <span className="font-medium text-ink">
              <MoneyText
                value={data ? moneyFromDto(data.balanceAfterUpcoming) : zero}
                fractionDigits="none"
              />
            </span>
          </div>
          <div className="px-7">
            <Link to="/calendar" className={panelLinkClass}>
              {t('upcoming.seeAll')}
            </Link>
          </div>
        </>
      )}
    </Panel>
  )
}
