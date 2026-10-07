import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { cn } from '../../lib/cn'
import { useSampleData } from '../../lib/sample-data'
import { TransactionTable } from './TransactionTable'

const FILTERS = ['all', 'needsReview', 'spending', 'income'] as const
type Filter = (typeof FILTERS)[number]

export function TransactionsPage() {
  const { t } = useTranslation()
  const data = useSampleData()
  const [filter, setFilter] = useState<Filter>('all')

  const rows = data.transactions.filter((row) => {
    if (filter === 'needsReview') return row.categoryKey === null
    if (filter === 'spending') return row.amount.isNegative()
    if (filter === 'income') return row.amount.isPositive()
    return true
  })

  const summary = [
    { key: 'income', value: data.monthSummary.income, tone: 'signed' as const, signed: true },
    { key: 'spending', value: data.monthSummary.spending, tone: 'signed' as const, signed: true },
    {
      key: 'transfers',
      value: data.monthSummary.transfers,
      tone: 'neutral' as const,
      signed: false,
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('transactions.eyebrow')}
        title={t('pages.transactions.title')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary">{t('transactions.import')}</Button>
            <Button variant="secondary">{t('showcase.export')}</Button>
          </div>
        }
      />

      <div className="grid gap-5 md:grid-cols-4">
        {summary.map((tile) => (
          <section
            key={tile.key}
            className="flex flex-col gap-2 rounded-card border border-transparent bg-surface p-7"
          >
            <h2 className="m-0 text-label font-normal text-ink-3">
              {t(`transactions.summary.${tile.key}`)}
            </h2>
            <span className="text-value-m">
              <MoneyText
                value={tile.value}
                tone={tile.tone}
                signDisplay={tile.signed ? 'always' : 'auto'}
              />
            </span>
          </section>
        ))}
        <section className="flex flex-col gap-2 rounded-card border border-transparent bg-surface p-7">
          <h2 className="m-0 text-label font-normal text-ink-3">
            {t('transactions.summary.needsReview')}
          </h2>
          <span className="text-value-m text-ink">{data.monthSummary.needsReview}</span>
          <Badge tone="warning">{t('transactions.reviewThem')}</Badge>
        </section>
      </div>

      <Panel
        title={t('transactions.list')}
        meta={t('transactions.shown', { count: rows.length })}
        flush
        action={
          <div role="group" aria-label={t('transactions.filter')} className="flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className={cn(
                  'h-[34px] cursor-pointer rounded-full border px-4 text-label font-medium transition-colors duration-150 ease-mizan',
                  filter === option
                    ? 'border-transparent bg-primary text-on-primary'
                    : 'border-border-strong bg-surface text-ink-2 hover:bg-inset',
                )}
              >
                {t(`transactions.filters.${option}`)}
              </button>
            ))}
          </div>
        }
      >
        {rows.length > 0 ? (
          <TransactionTable rows={rows} />
        ) : (
          <p className="m-0 px-7 text-body text-ink-2">{t('transactions.noMatches')}</p>
        )}
        <p className="m-0 px-7 text-caption text-ink-3">{t('transactions.importNote')}</p>
      </Panel>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 5 })}</p>
    </PageContainer>
  )
}
