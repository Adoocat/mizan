import { Money } from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { cn } from '../../lib/cn'
import { INVESTMENTS, MONTH_KEYS } from '../../lib/wealth-data'
import { SeriesChart, ShareBar } from '../landing/visuals'

export function InvestmentsPage() {
  const { t } = useTranslation()
  const total = INVESTMENTS.classes.reduce((sum, item) => sum.plus(item.value), Money.zero('TRY'))

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('investments.eyebrow')}
        title={t('nav.investments')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary">{t('investments.recordDividend')}</Button>
            <Button variant="primary">{t('investments.addHolding')}</Button>
          </div>
        }
      />

      <Panel title={t('investments.totalValue')}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-display-figure text-ink">
              <MoneyText value={INVESTMENTS.value} fractionDigits="none" />
            </span>
            <span className="text-lead text-ink-2">
              {t('investments.inclCash', { amount: '₺24,600' })}
            </span>
          </div>
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-8 gap-y-5">
            {(
              [
                ['invested', <MoneyText value={INVESTMENTS.invested} fractionDigits="none" />, ''],
                [
                  'unrealised',
                  <MoneyText
                    value={INVESTMENTS.unrealised}
                    tone="signed"
                    signDisplay="always"
                    fractionDigits="none"
                  />,
                  'text-positive',
                ],
                [
                  'return12',
                  <PercentText
                    value={INVESTMENTS.return12m}
                    fractionDigits={1}
                    signDisplay="always"
                  />,
                  'text-positive',
                ],
                [
                  'real',
                  <PercentText
                    value={INVESTMENTS.realReturn}
                    fractionDigits={1}
                    signDisplay="always"
                  />,
                  'text-positive',
                ],
              ] as const
            ).map(([key, value, tone]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <dt className="text-label text-ink-3">{t(`investments.stats.${key}`)}</dt>
                <dd className={cn('m-0 text-value-s', tone)}>{value}</dd>
                <dd className="m-0 text-caption text-ink-3">{t(`investments.statNotes.${key}`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Panel>

      <Panel title={t('investments.growth')} meta={t('investments.growthNote')}>
        <SeriesChart
          values={INVESTMENTS.marketValue}
          context={INVESTMENTS.netInvested}
          label={t('investments.growth')}
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
            {t('investments.marketValue')}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 border-t-2 border-dashed border-ink-3" />
            {t('investments.netInvested')}
          </span>
        </div>
      </Panel>

      <Panel title={t('investments.allocation')} meta={t('investments.allocationNote')} flush>
        <div className="flex flex-col gap-5 px-7">
          <div className="flex flex-col gap-2">
            <span className="text-caption text-ink-3">{t('investments.current')}</span>
            <ShareBar
              label={t('investments.current')}
              rows={INVESTMENTS.classes.map((item) => ({
                key: item.id,
                share: item.value.amount.dividedBy(total.amount),
                color: item.color,
              }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-caption text-ink-3">{t('investments.target')}</span>
            <ShareBar
              label={t('investments.target')}
              rows={INVESTMENTS.classes.map((item) => ({
                key: item.id,
                share: item.target,
                color: item.color,
              }))}
            />
          </div>
        </div>
        <div className="flex flex-col">
          <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-x-4 border-b border-divider px-7 pb-2 text-caption font-medium text-ink-3">
            <span>{t('investments.columns.class')}</span>
            <span className="text-right">{t('investments.columns.value')}</span>
            <span className="text-right">{t('investments.columns.now')}</span>
            <span className="text-right">{t('investments.columns.target')}</span>
            <span className="text-right">{t('investments.columns.drift')}</span>
          </div>
          {INVESTMENTS.classes.map((item) => {
            const current = item.value.amount.dividedBy(total.amount)
            const drift = current.minus(item.target)
            return (
              <div
                key={item.id}
                className="mx-3 grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] items-center gap-x-4 rounded-control px-4 py-3 text-body hover:bg-inset"
              >
                <span className="flex items-center gap-2.5 text-ink">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ background: item.color }}
                  />
                  {t(`landing.holdings.${item.id}`)}
                </span>
                <span className="text-right text-ink-2">
                  <MoneyText value={item.value} fractionDigits="none" />
                </span>
                <span className="text-right text-ink-2">
                  <PercentText value={current} fractionDigits={1} />
                </span>
                <span className="text-right text-ink-3">
                  <PercentText value={item.target} fractionDigits={0} />
                </span>
                <span
                  className={cn(
                    'text-right',
                    drift.abs().greaterThan('0.05')
                      ? 'text-warning'
                      : drift.isZero()
                        ? 'text-ink-3'
                        : 'text-ink-2',
                  )}
                >
                  {drift.times(100).toDecimalPlaces(1).toFixed(1)} pp
                </span>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title={t('investments.rebalancing')}>
        <p className="m-0 max-w-[60ch] text-lead text-ink-2">
          {t('investments.rebalanceHeadline')}
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2.5 rounded-inset bg-inset p-5">
            <h3 className="m-0 text-panel-title text-ink">{t('investments.redirect')}</h3>
            <p className="m-0 text-body text-ink-2">
              {t('investments.redirectBody', { months: INVESTMENTS.rebalanceMonths })}
            </p>
          </div>
          <div className="flex flex-col gap-2.5 rounded-inset bg-inset p-5">
            <h3 className="m-0 text-panel-title text-ink">{t('investments.rebalanceNow')}</h3>
            <p className="m-0 text-body text-ink-2">
              {t('investments.rebalanceNowBody', { amount: '₺125,000' })}
            </p>
          </div>
        </div>
        <p className="m-0 text-caption text-ink-3">{t('investments.disclaimer')}</p>
      </Panel>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 13 })}</p>
    </PageContainer>
  )
}
