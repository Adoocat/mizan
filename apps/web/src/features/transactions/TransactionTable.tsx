import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { Badge } from '../../components/ui/Badge'
import type { TransactionLine } from '../../lib/sample-data'

const CATEGORY_DOTS: Record<string, string> = {
  diningOut: 'bg-data-pool',
  groceries: 'bg-data-essentials',
  transport: 'bg-data-flexible',
  shopping: 'bg-data-pool',
  income: 'bg-positive-bar',
}

const ROW_GRID =
  'grid grid-cols-[64px_minmax(0,1.4fr)_minmax(0,1fr)] gap-x-3 md:grid-cols-[64px_minmax(140px,1.4fr)_minmax(110px,1fr)_minmax(90px,0.8fr)_110px]'

/**
 * The transactions table from the mockups. A row without a category shows the "Needs review"
 * badge instead, which is the one thing in this table the user is expected to act on.
 */
export function TransactionTable({ rows }: { rows: TransactionLine[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col">
      <div
        className={`${ROW_GRID} border-b border-divider px-7 pb-2 text-caption font-medium text-ink-3`}
      >
        <span>{t('transactions.columns.date')}</span>
        <span>{t('transactions.columns.merchant')}</span>
        <span>{t('transactions.columns.category')}</span>
        <span className="hidden md:block">{t('transactions.columns.account')}</span>
        <span className="hidden text-right md:block">{t('transactions.columns.amount')}</span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`${ROW_GRID} mx-3 items-center rounded-control px-4 py-3 hover:bg-inset`}
          >
            <span className="text-caption whitespace-nowrap text-ink-3">{row.date}</span>
            <span className="truncate text-body text-ink">{row.merchant}</span>
            <span className="min-w-0">
              {row.categoryKey ? (
                <span className="flex items-center gap-2 truncate text-body text-ink-2">
                  <span
                    aria-hidden
                    className={`size-1.5 flex-none rounded-full ${
                      CATEGORY_DOTS[row.categoryKey] ?? 'bg-ink-3'
                    }`}
                  />
                  {t(`categories.${row.categoryKey}`)}
                </span>
              ) : (
                <Badge tone="warning">{t('transactions.needsReview')}</Badge>
              )}
            </span>
            <span className="hidden truncate text-caption text-ink-3 md:block">{row.account}</span>
            <span className="col-span-3 text-right text-body md:col-span-1">
              <MoneyText value={row.amount} tone="signed" signDisplay="auto" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
