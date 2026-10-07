import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Panel } from '../../components/ui/Panel'
import { StatTiles } from '../../components/ui/StatTiles'
import { MONTH_KEYS, NET_WORTH } from '../../lib/wealth-data'
import { SeriesChart } from '../landing/visuals'

export function NetWorthPage() {
  const { t } = useTranslation()

  const rows = (
    rowSet: { key: string; value: typeof NET_WORTH.total; change: typeof NET_WORTH.total }[],
    total: typeof NET_WORTH.total,
    group: 'assets' | 'liabilities',
  ) => (
    <div className="flex flex-col">
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 border-b border-divider px-7 pb-2 text-caption font-medium text-ink-3">
        <span>{t('netWorth.columns.category')}</span>
        <span className="text-right">{t('netWorth.columns.value')}</span>
        <span className="text-right">{t('netWorth.columns.month')}</span>
      </div>
      {rowSet.map((row) => (
        <div
          key={row.key}
          className="mx-3 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-4 rounded-control px-4 py-3 text-body hover:bg-inset"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-ink">{t(`netWorth.rows.${group}.${row.key}`)}</span>
            <span className="truncate text-caption text-ink-3">
              {t(`netWorth.sources.${group}.${row.key}`)}
            </span>
          </span>
          <span className="text-right text-ink">
            <MoneyText value={row.value} fractionDigits="none" />
          </span>
          <span className="text-right">
            <MoneyText
              value={row.change}
              tone="signed"
              signDisplay="always"
              fractionDigits="none"
            />
          </span>
        </div>
      ))}
      <div className="mx-3 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 border-t border-divider px-4 pt-3 text-body font-medium">
        <span>{t('netWorth.total')}</span>
        <span className="text-right">
          <MoneyText value={total} fractionDigits="none" />
        </span>
        <span />
      </div>
    </div>
  )

  return (
    <PageContainer>
      <PageHeader eyebrow={t('netWorth.eyebrow')} title={t('nav.netWorth')} />

      <Panel title={t('netWorth.onDate')}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <span className="text-display-figure text-ink">
            <MoneyText value={NET_WORTH.total} fractionDigits="none" />
          </span>
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-8 gap-y-5">
            <div className="flex flex-col gap-1.5">
              <dt className="text-label text-ink-3">{t('netWorth.sinceLastMonth')}</dt>
              <dd className="m-0 text-value-s text-positive">
                <MoneyText
                  value={NET_WORTH.sinceLastMonth}
                  tone="signed"
                  signDisplay="always"
                  fractionDigits="none"
                />{' '}
                <span className="text-caption">
                  (+
                  <PercentText value={NET_WORTH.sinceLastMonthShare} fractionDigits={1} />)
                </span>
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-label text-ink-3">{t('netWorth.assets')}</dt>
              <dd className="m-0 text-value-s text-ink">
                <MoneyText value={NET_WORTH.assets} fractionDigits="none" />
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-label text-ink-3">{t('netWorth.liabilities')}</dt>
              <dd className="m-0 text-value-s text-ink">
                <MoneyText value={NET_WORTH.liabilities} fractionDigits="none" />
              </dd>
            </div>
          </dl>
        </div>
        <SeriesChart
          values={NET_WORTH.series}
          context={NET_WORTH.liabilitySeries}
          label={t('netWorth.chart')}
          height={200}
        />
        <div className="grid grid-cols-12 gap-1 text-center text-caption text-ink-3">
          {MONTH_KEYS.map((key) => (
            <span key={key}>{t(`months.${key}`)}</span>
          ))}
        </div>
        <div className="flex gap-5 text-caption text-ink-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 bg-accent" />
            {t('nav.netWorth')}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 border-t-2 border-dashed border-ink-3" />
            {t('netWorth.liabilities')}
          </span>
        </div>
      </Panel>

      <div className="flex flex-wrap gap-5">
        <Panel title={t('netWorth.assets')} flush className="flex-1 basis-[26rem]">
          {rows(NET_WORTH.assetRows, NET_WORTH.assets, 'assets')}
        </Panel>
        <Panel title={t('netWorth.liabilities')} flush className="flex-1 basis-[22rem]">
          {rows(NET_WORTH.liabilityRows, NET_WORTH.liabilities, 'liabilities')}
        </Panel>
      </div>

      <StatTiles
        tiles={[
          {
            key: 'liquid',
            label: t('netWorth.liquid'),
            value: <MoneyText value={NET_WORTH.liquid} fractionDigits="none" />,
            note: t('netWorth.liquidNote'),
          },
          {
            key: 'ratio',
            label: t('netWorth.debtRatio'),
            value: <PercentText value={NET_WORTH.debtToAssets} fractionDigits={1} />,
            note: t('netWorth.debtRatioNote'),
          },
          {
            key: 'change',
            label: t('netWorth.changeFrom'),
            value: (
              <span className="text-value-s">
                {t('netWorth.changeBreakdown', {
                  contributions: '₺14,000',
                  markets: '₺18,700',
                  debt: '₺5,700',
                })}
              </span>
            ),
            note: t('netWorth.changeNote'),
          },
        ]}
      />

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 17 })}</p>
    </PageContainer>
  )
}
