import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { ProgressBar } from '../../components/finance/Progress'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { StatTiles } from '../../components/ui/StatTiles'
import { cn } from '../../lib/cn'
import { SAVINGS } from '../../lib/wealth-data'

export function SavingsPage() {
  const { t } = useTranslation()
  const emergency = SAVINGS.emergency
  const share = emergency.saved.amount.dividedBy(emergency.target.amount)

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('savings.eyebrow')}
        title={t('nav.savings')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary">{t('savings.newFund')}</Button>
            <Button variant="primary">{t('goals.newGoal')}</Button>
          </div>
        }
      />

      <StatTiles
        tiles={[
          {
            key: 'total',
            label: t('savings.tiles.total'),
            value: <MoneyText value={SAVINGS.total} fractionDigits="none" />,
            note: t('savings.tiles.totalNote'),
          },
          {
            key: 'monthly',
            label: t('savings.tiles.monthly'),
            value: <MoneyText value={SAVINGS.monthly} fractionDigits="none" />,
            note: t('savings.tiles.monthlyNote', {
              percent: SAVINGS.monthlyShare.times(100).toFixed(0),
            }),
          },
          {
            key: 'interest',
            label: t('savings.tiles.interest'),
            value: (
              <MoneyText
                value={SAVINGS.interest2026}
                tone="signed"
                signDisplay="always"
                fractionDigits="none"
              />
            ),
            note: t('savings.tiles.interestNote'),
          },
          {
            key: 'rate',
            label: t('savings.tiles.rate'),
            value: <PercentText value={SAVINGS.savingsRate} fractionDigits={1} />,
            note: t('savings.tiles.rateNote'),
          },
        ]}
      />

      <div className="flex flex-wrap gap-5">
        <Panel
          title={t('goals.names.emergency')}
          meta={t('savings.priority')}
          className="flex-[1.3] basis-[30rem]"
          action={<Badge tone="warning">{t('savings.funded', { percent: 55 })}</Badge>}
        >
          <div className="flex flex-wrap items-end justify-between gap-5">
            <span className="text-display-figure text-ink">
              <MoneyText value={emergency.saved} fractionDigits="none" />
            </span>
            <span className="text-lead text-ink-2">
              {t('savings.ofTarget')} <MoneyText value={emergency.target} fractionDigits="none" />
            </span>
          </div>
          <ProgressBar value={share} tone="accent" label={t('goals.names.emergency')} />
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-5">
            {(
              [
                ['oneMonth', emergency.oneMonth, true],
                ['threeMonths', emergency.threeMonths, true],
                ['sixMonths', emergency.sixMonths, false],
              ] as const
            ).map(([key, amount, reached]) => (
              <div key={key} className="flex flex-col gap-1.5">
                <dt className="text-label text-ink-3">{t(`savings.milestones.${key}`)}</dt>
                <dd
                  className={cn('m-0 text-value-s', reached ? 'text-positive' : 'text-ink')}
                  aria-label={reached ? t('savings.reached') : undefined}
                >
                  {reached && <span aria-hidden>✓ </span>}
                  <MoneyText value={amount} fractionDigits="none" />
                </dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-caption text-ink-3">
            {t('savings.monthsNote', {
              months: emergency.months.toFixed(1),
              toGo: '₺66,800',
            })}
          </p>
        </Panel>

        <Panel
          title={t('savings.essentials')}
          meta={t('savings.essentialsNote')}
          className="flex-1 basis-[20rem]"
        >
          <dl className="m-0 flex flex-col gap-3">
            {SAVINGS.essentials.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-3 text-body">
                <dt className="text-ink-2">{t(`categories.${row.key}`)}</dt>
                <dd className="m-0 text-ink">
                  <MoneyText value={row.amount} fractionDigits="none" />
                </dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-3 text-body font-medium">
              <dt>{t('savings.perMonth')}</dt>
              <dd className="m-0">
                <MoneyText value={emergency.monthlyExpenses} fractionDigits="none" />
              </dd>
            </div>
          </dl>
          <p className="m-0 text-caption text-ink-3">{t('savings.interestNote')}</p>
        </Panel>
      </div>

      <Panel title={t('savings.otherGoals')} flush>
        <div className="flex flex-col gap-5 px-7">
          {SAVINGS.goals.map((goal) => (
            <div key={goal.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-3 text-body">
                <span className="text-ink">{t(`goals.names.${goal.id}`)}</span>
                <span className="text-ink-2">
                  <MoneyText value={goal.saved} fractionDigits="none" />
                  <span className="text-ink-3">
                    {' / '}
                    <MoneyText value={goal.target} fractionDigits="none" />
                  </span>
                </span>
              </div>
              <ProgressBar
                value={goal.saved.amount.dividedBy(goal.target.amount)}
                tone={goal.status === 'behind' ? 'warning' : 'accent'}
                label={t(`goals.names.${goal.id}`)}
              />
              <div className="flex flex-wrap justify-between gap-3 text-caption text-ink-3">
                <span>
                  {t('savings.monthly')} <MoneyText value={goal.monthly} fractionDigits="none" />
                </span>
                <span
                  className={cn(
                    goal.status === 'behind' && 'text-warning',
                    goal.status === 'onTrack' && 'text-positive',
                  )}
                >
                  {t(`goals.notes.${goal.id}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t('savings.sinkingFunds')} meta={t('savings.sinkingNote')}>
        <div className="flex flex-wrap items-baseline gap-2 text-body text-ink-2">
          {t('savings.saved')}{' '}
          <span className="text-value-s text-ink">
            <MoneyText value={SAVINGS.sinkingFunds.saved} fractionDigits="none" />
          </span>{' '}
          {t('savings.of')} <MoneyText value={SAVINGS.sinkingFunds.needed} fractionDigits="none" />
        </div>
        <div className="flex flex-col gap-4">
          {SAVINGS.sinkingFunds.funds.map((fund) => (
            <div key={fund.key} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-3 text-body">
                <span className="text-ink">{t(`savings.funds.${fund.key}`)}</span>
                <span className="text-ink-2">
                  <MoneyText value={fund.saved} fractionDigits="none" />
                  <span className="text-ink-3">
                    {' / '}
                    <MoneyText value={fund.needed} fractionDigits="none" />
                  </span>
                </span>
              </div>
              <ProgressBar
                value={fund.saved.amount.dividedBy(fund.needed.amount)}
                tone="pace"
                label={t(`savings.funds.${fund.key}`)}
              />
              <span className="text-caption text-ink-3">{t(`savings.due.${fund.due}`)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 8 })}</p>
    </PageContainer>
  )
}
