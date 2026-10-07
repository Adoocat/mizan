import { formatMoney, Money } from '@mizan/domain'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CashFlowChart } from '../../components/finance/CashFlowChart'
import { HeroPanel } from '../../components/finance/MetricCard'
import { MoneyText } from '../../components/finance/MoneyText'
import { BudgetProgress, ProgressBar } from '../../components/finance/Progress'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel, panelLinkClass } from '../../components/ui/Panel'
import { useSampleData } from '../../lib/sample-data'
import { useNumberLocale } from '../../lib/use-locale'
import { HealthIndicator } from '../health/HealthIndicator'
import { TransactionTable } from '../transactions/TransactionTable'
import { UpcomingList } from '../calendar/UpcomingList'

/** The four lines of the plan, as a single stacked strip (mockup: Dashboard, hero panel). */
function PlanStrip() {
  const { t } = useTranslation()
  const { plan } = useSampleData()
  const total = plan.groups.reduce((sum, group) => sum.plus(group.amount), Money.zero('TRY'))
  return (
    <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
      {plan.groups.map((group) => (
        <span
          key={group.key}
          className={group.colorClass}
          style={{ width: `${group.amount.amount.dividedBy(total.amount).times(100).toFixed(2)}%` }}
          title={t(`plan.groups.${group.key}`)}
        />
      ))}
    </div>
  )
}

function NeedsAttention() {
  const { t } = useTranslation()
  const { alerts } = useSampleData()
  const [done, setDone] = useState<Record<string, boolean>>({})
  const open = alerts.filter((alert) => !done[alert.id])

  return (
    <Panel
      title={t('home.needsAttention')}
      meta={open.length > 0 ? t('home.openCount', { count: open.length }) : t('home.allClear')}
      flush
    >
      <ul className="m-0 flex list-none flex-col gap-px p-0">
        {alerts.map((alert) => {
          const resolved = done[alert.id] === true
          return (
            <li
              key={alert.id}
              className="mx-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control px-4 py-3.5 hover:bg-inset"
            >
              <span
                aria-hidden
                className={`size-1.5 flex-none rounded-full ${
                  alert.tone === 'negative'
                    ? 'bg-negative'
                    : alert.tone === 'warning'
                      ? 'bg-warning'
                      : 'bg-accent'
                }`}
              />
              <span className="text-caption font-medium whitespace-nowrap text-ink-3">
                {t(`home.alertKind.${alert.kind}`)}
              </span>
              <p
                className={`m-0 min-w-[16rem] flex-1 text-body ${resolved ? 'text-ink-3' : 'text-ink'}`}
              >
                {t(`home.alerts.${alert.id}`)}
              </p>
              {resolved ? (
                <span className="text-caption text-ink-3">✓ {t(`home.alertDone.${alert.id}`)}</span>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setDone((current) => ({ ...current, [alert.id]: true }))}
                >
                  {t(`home.alertAction.${alert.id}`)}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function CashFlow() {
  const { t } = useTranslation()
  const { cashFlow, glance } = useSampleData()
  const points = cashFlow.map((month) => ({
    key: month.key,
    label: t(`months.${month.key}`),
    income: month.income,
    spending: month.spending,
  }))
  const latest = cashFlow.at(-1)!
  const kept = latest.income.minus(latest.spending)

  return (
    <Panel
      title={t('home.cashFlow')}
      className="flex-[1.6] basis-[32rem]"
      action={
        <div className="flex items-center gap-4 text-caption text-ink-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 border-t-2 border-dashed border-ink-3" />
            {t('home.income')}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 bg-accent" />
            {t('home.spending')}
          </span>
        </div>
      }
    >
      <p className="m-0 text-caption text-ink-2">{t('home.cashFlowNote')}</p>
      <CashFlowChart points={points} label={t('home.cashFlowChartLabel')} />
      <div className="grid grid-cols-6 gap-2 text-center text-caption text-ink-3">
        {points.map((point) => (
          <span key={point.key}>{point.label}</span>
        ))}
      </div>
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 border-t border-divider pt-5">
        <div className="flex flex-col gap-1">
          <dt className="text-label text-ink-3">{t('home.octoberSoFar')}</dt>
          <dd className="m-0 text-value-s">
            <MoneyText value={kept} tone="signed" signDisplay="always" fractionDigits="none" />{' '}
            <span className="text-caption text-ink-3">{t('home.kept')}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label text-ink-3">{t('home.averageSpending')}</dt>
          <dd className="m-0 text-value-s">
            <MoneyText value={glance.averageSpending} fractionDigits="none" />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-label text-ink-3">{t('home.spentThisMonth')}</dt>
          <dd className="m-0 text-value-s">
            <MoneyText value={glance.spentThisMonth} fractionDigits="none" />
          </dd>
        </div>
      </dl>
    </Panel>
  )
}

export function HomePage() {
  const { t } = useTranslation()
  const data = useSampleData()
  const locale = useNumberLocale()

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('home.date')}
        title={t('home.greeting', { name: data.userName })}
        actions={
          <div className="flex flex-wrap gap-5 text-body text-ink-2">
            <span>
              {t('home.lastSync')} <span className="font-medium text-ink">{data.lastSync}</span>
            </span>
            <span>
              {t('home.figuresIn')} <span className="font-medium text-ink">{data.currency}</span>
            </span>
            <HealthIndicator />
          </div>
        }
      />

      <HeroPanel
        label={t('home.availableToSpend')}
        value={<MoneyText value={data.hero.left} fractionDigits="none" />}
        footnote={t('home.heroFootnote', {
          total: formatMoney(data.hero.availableThisMonth, locale, { fractionDigits: 'none' }),
          days: data.hero.daysLeft,
        })}
        aside={
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="m-0 text-panel-title text-ink">{t('home.monthPlan')}</h2>
              <Badge tone="positive">{t('showcase.badge.fullyAllocated')}</Badge>
              <Link to="/plan" className={`${panelLinkClass} ml-auto`}>
                {t('home.openPlan')}
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              <PlanStrip />
              <div className="flex justify-between gap-3 text-caption text-ink-3">
                <span>{t('home.incomeReceived')}</span>
                <span>{t('home.unassignedZero')}</span>
              </div>
            </div>
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-x-6 gap-y-5">
              {data.plan.groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                  <dt className="flex items-center gap-2 text-label text-ink-2">
                    <span aria-hidden className={`size-2 rounded-[2px] ${group.colorClass}`} />
                    {t(`plan.groups.${group.key}`)}
                  </dt>
                  <dd className="m-0 text-value-s text-ink">
                    <MoneyText value={group.amount} fractionDigits="none" />
                  </dd>
                  <dd className="m-0 text-caption text-ink-3">{t(`home.planNote.${group.key}`)}</dd>
                </div>
              ))}
            </dl>
          </>
        }
      >
        <div className="flex max-w-[420px] flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3 text-body">
            <span>
              <span className="text-[20px] tracking-[-0.02em]">
                <MoneyText value={data.hero.perDay} fractionDigits="none" />
              </span>{' '}
              <span className="text-ink-3">{t('home.aDay')}</span>
            </span>
            <span className="text-ink-2">
              <MoneyText value={data.hero.spentToday} fractionDigits="none" /> {t('home.spent')} ·{' '}
              <span className="font-medium text-ink">
                <MoneyText value={data.hero.leftToday} fractionDigits="none" />{' '}
                {t('home.leftToday')}
              </span>
            </span>
          </div>
          <ProgressBar
            value={data.hero.spentTodayRatio}
            tone="warning"
            label={t('home.todayAllowance')}
          />
          <p className="m-0 text-caption text-ink-3">{t('home.carryNote')}</p>
        </div>
      </HeroPanel>

      <NeedsAttention />

      <div className="flex flex-wrap gap-5">
        <CashFlow />
        <Panel
          title={t('home.comingUp')}
          meta={t('home.comingUpRange')}
          className="flex-1 basis-[22rem]"
          flush
          action={
            <span className="text-value-s text-ink">
              <MoneyText value={data.upcomingTotal} fractionDigits="none" />
            </span>
          }
        >
          <UpcomingList items={data.upcoming.slice(0, 6)} />
          <div className="flex justify-between gap-3 px-7 text-caption text-ink-3">
            <span>{t('home.checkingAfter')}</span>
            <span className="font-medium text-ink">
              <MoneyText value={data.checkingAfterUpcoming} fractionDigits="none" />
            </span>
          </div>
        </Panel>
      </div>

      <div className="flex flex-wrap gap-5">
        <Panel
          title={t('home.budgets')}
          meta={t('home.paceNote', { percent: 71 })}
          className="flex-[1.25] basis-[28rem]"
          action={
            <Link to="/plan" className={panelLinkClass}>
              {t('home.allBudgets')}
            </Link>
          }
        >
          <div className="flex flex-col gap-5">
            {data.budgets.map((budget) => (
              <BudgetProgress
                key={budget.id}
                name={t(`categories.${budget.id}`)}
                spent={budget.spent}
                limit={budget.limit}
                status={budget.status}
                expectedPace={data.plan.elapsed}
                note={
                  budget.status === 'over' ? (
                    <>
                      <MoneyText value={budget.spent.minus(budget.limit)} fractionDigits="none" />{' '}
                      {t('budget.over')}
                    </>
                  ) : (
                    <>
                      <MoneyText value={budget.limit.minus(budget.spent)} fractionDigits="none" />{' '}
                      {t('budget.left')}
                    </>
                  )
                }
              />
            ))}
          </div>
        </Panel>

        <Panel
          title={t('home.savingsGoals')}
          className="flex-1 basis-[22rem]"
          meta={
            <>
              <MoneyText value={data.goalsTotal} fractionDigits="none" />{' '}
              {t('home.savedAcross', { count: data.goals.length })}
            </>
          }
          action={
            <Link to="/goals" className={panelLinkClass}>
              {t('home.allGoals')}
            </Link>
          }
        >
          <div className="flex flex-col gap-5">
            {data.goals.map((goal) => (
              <div key={goal.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-body">
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
                <p
                  className={`m-0 text-caption ${
                    goal.status === 'behind'
                      ? 'text-warning'
                      : goal.status === 'onTrack'
                        ? 'text-positive'
                        : 'text-ink-3'
                  }`}
                >
                  {t(`goals.notes.${goal.id}`)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title={t('home.recentTransactions')}
        meta={t('home.toReview', { count: 4 })}
        flush
        action={
          <Link to="/transactions" className={panelLinkClass}>
            {t('home.allTransactions')}
          </Link>
        }
      >
        <TransactionTable rows={data.transactions} />
      </Panel>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 11 })}</p>
    </PageContainer>
  )
}
