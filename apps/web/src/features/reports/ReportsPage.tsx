import { Decimal } from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { ProgressBar } from '../../components/finance/Progress'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { cn } from '../../lib/cn'
import { MONTH_KEYS, REPORTS } from '../../lib/wealth-data'
import { SeriesChart } from '../landing/visuals'

export function ReportsPage() {
  const { t } = useTranslation()
  const biggest = REPORTS.categories.reduce(
    (max, row) => Decimal.max(max, row.amount.amount),
    new Decimal(0),
  )

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('reports.eyebrow')}
        title={t('nav.reports')}
        actions={<Button variant="secondary">{t('reports.exportPdf')}</Button>}
      />

      <Panel title={t('reports.health')}>
        <div className="flex flex-wrap items-end gap-6">
          <span className="text-display-figure text-ink">
            {REPORTS.score}
            <span className="text-panel-value text-ink-3"> / 100</span>
          </span>
          <Badge tone="positive">{t(`reports.bands.${REPORTS.scoreBand}`)}</Badge>
        </div>
        <ProgressBar
          value={new Decimal(REPORTS.score).dividedBy(100)}
          tone="positive"
          label={t('reports.health')}
        />
        <div className="flex justify-between gap-3 text-caption text-ink-3">
          {(['needsAttention', 'fair', 'good', 'strong'] as const).map((band) => (
            <span key={band}>{t(`reports.bands.${band}`)}</span>
          ))}
        </div>
        <p className="m-0 max-w-[70ch] text-body text-ink-2">
          {t('reports.scoreSummary', { points: REPORTS.scoreChange })}
        </p>
        <p className="m-0 text-caption text-ink-3">{t('reports.scoreDisclaimer')}</p>

        <dl className="m-0 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {REPORTS.health.map((row) => (
            <div key={row.key} className="flex flex-col gap-2 rounded-inset bg-inset p-5">
              <dt className="flex items-baseline justify-between gap-3">
                <span className="text-panel-title text-ink">{t(`reports.factors.${row.key}`)}</span>
                <span className="text-value-s text-ink">
                  {row.score}
                  <span className="text-caption text-ink-3"> / 20</span>
                </span>
              </dt>
              <dd className="m-0 text-caption text-ink-3">{t(`reports.factorMeta.${row.key}`)}</dd>
              <dd className="m-0 text-body text-ink-2">{t(`reports.factorText.${row.key}`)}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title={t('reports.incomeVsExpenses')} meta={t('reports.incomeVsExpensesNote')}>
        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-5">
          <div className="flex flex-col gap-1.5">
            <dt className="text-label text-ink-3">{t('reports.avgIncome')}</dt>
            <dd className="m-0 text-value-s text-ink">
              <MoneyText value={REPORTS.averageIncome} fractionDigits="none" />
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="text-label text-ink-3">{t('reports.avgSpending')}</dt>
            <dd className="m-0 text-value-s text-ink">
              <MoneyText value={REPORTS.averageSpending} fractionDigits="none" />
            </dd>
          </div>
          <div className="flex flex-col gap-1.5">
            <dt className="text-label text-ink-3">{t('reports.avgRate')}</dt>
            <dd className="m-0 text-value-s text-positive">
              <PercentText value={REPORTS.averageSavingsRate} fractionDigits={1} />
            </dd>
          </div>
        </dl>
        <SeriesChart
          values={REPORTS.income}
          context={REPORTS.spending}
          label={t('reports.incomeVsExpenses')}
          height={180}
        />
        <div className="grid grid-cols-12 gap-1 text-center text-caption text-ink-3">
          {MONTH_KEYS.map((key) => (
            <span key={key}>{t(`months.${key}`)}</span>
          ))}
        </div>
      </Panel>

      <Panel title={t('reports.spendingByCategory')} meta={t('reports.spendingNote')} flush>
        <div className="flex flex-col gap-4 px-7">
          {REPORTS.categories.map((row) => {
            const delta = row.amount.minus(row.average)
            return (
              <div key={row.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-body">
                  <span className="text-ink">{t(`categories.${row.key}`)}</span>
                  <span className="flex items-baseline gap-3">
                    <span className="text-ink">
                      <MoneyText value={row.amount} fractionDigits="none" />
                    </span>
                    <span
                      className={cn(
                        'text-caption',
                        delta.isPositive() ? 'text-warning' : 'text-ink-3',
                      )}
                    >
                      <MoneyText
                        value={delta}
                        signDisplay="always"
                        fractionDigits="none"
                        tone="neutral"
                      />{' '}
                      {t('reports.vsAverage')}
                    </span>
                  </span>
                </div>
                <ProgressBar
                  value={row.amount.amount.dividedBy(biggest)}
                  marker={row.average.amount.dividedBy(biggest)}
                  tone="pace"
                  label={t(`categories.${row.key}`)}
                />
              </div>
            )
          })}
        </div>
        <p className="m-0 px-7 text-caption text-ink-3">{t('reports.spendingSummary')}</p>
      </Panel>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 18 })}</p>
    </PageContainer>
  )
}
