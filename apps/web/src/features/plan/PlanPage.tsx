import { Money } from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { ProgressBar } from '../../components/finance/Progress'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { useSampleData, type PlanCategoryGroup } from '../../lib/sample-data'

const sum = (amounts: Money[]) =>
  amounts.reduce((total, amount) => total.plus(amount), Money.zero('TRY'))

function groupTotals(group: PlanCategoryGroup) {
  const budgeted = sum(group.lines.map((line) => line.budgeted))
  const spent = sum(group.lines.map((line) => line.spent))
  return { budgeted, spent, remaining: budgeted.minus(spent) }
}

/** Income · Allocated · Left to allocate, the three numbers the plan is judged by. */
function PlanTotals() {
  const { t } = useTranslation()
  const { plan, planCategories } = useSampleData()
  const allocated = sum(planCategories.map((group) => groupTotals(group).budgeted))
  const left = plan.income.minus(allocated)
  const share = allocated.amount.dividedBy(plan.income.amount)

  const tiles = [
    {
      key: 'income',
      value: plan.income,
      note: t('plan.incomeNote'),
      tone: '' as const,
    },
    {
      key: 'allocated',
      value: allocated,
      note: t('plan.allocatedNote', { percent: share.times(100).toFixed(0) }),
    },
    { key: 'left', value: left, note: t('plan.leftNote') },
  ]

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {tiles.map((tile) => (
        <section
          key={tile.key}
          className="flex flex-col gap-2 rounded-card border border-transparent bg-surface p-7"
        >
          <h2 className="m-0 text-label font-normal text-ink-3">{t(`plan.totals.${tile.key}`)}</h2>
          <span className="text-panel-value text-ink">
            <MoneyText value={tile.value} fractionDigits="none" />
          </span>
          <p className="m-0 text-caption text-ink-2">{tile.note}</p>
          {tile.key === 'left' && tile.value.isZero() && (
            <Badge tone="positive">{t('showcase.badge.fullyAllocated')}</Badge>
          )}
        </section>
      ))}
    </div>
  )
}

export function PlanPage() {
  const { t } = useTranslation()
  const data = useSampleData()

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('plan.eyebrow')}
        title={t('plan.title')}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" aria-label={t('plan.previousMonth')}>
              ‹
            </Button>
            <span className="px-1 text-body font-medium whitespace-nowrap text-ink">
              {t('plan.currentMonth')}
            </span>
            <Button size="sm" aria-label={t('plan.nextMonth')}>
              ›
            </Button>
            <Button variant="secondary">{t('plan.copyToNext')}</Button>
          </div>
        }
      />

      <PlanTotals />

      <Panel title={t('plan.allocation')} meta={t('plan.allocationNote')}>
        <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {data.plan.groups.map((group) => (
            <span
              key={group.key}
              className={group.colorClass}
              style={{
                width: `${group.amount.amount.dividedBy(data.plan.income.amount).times(100).toFixed(2)}%`,
              }}
            />
          ))}
        </div>
        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-5">
          {data.plan.groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1.5">
              <dt className="flex items-center gap-2 text-label text-ink-2">
                <span aria-hidden className={`size-2 rounded-[2px] ${group.colorClass}`} />
                {t(`plan.groups.${group.key}`)}
              </dt>
              <dd className="m-0 text-value-s text-ink">
                <MoneyText value={group.amount} fractionDigits="none" />
              </dd>
              <dd className="m-0 text-caption text-ink-3">
                <PercentText
                  value={group.amount.amount.dividedBy(data.plan.income.amount)}
                  fractionDigits={0}
                />{' '}
                {t('plan.ofIncome')}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title={t('plan.categories')} flush>
        <div className="flex flex-col">
          <div className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-x-4 border-b border-divider px-7 pb-2 text-caption font-medium text-ink-3">
            <span>{t('plan.columns.category')}</span>
            <span className="text-right">{t('plan.columns.budgeted')}</span>
            <span className="text-right">{t('plan.columns.spent')}</span>
            <span className="text-right">{t('plan.columns.remaining')}</span>
          </div>
          {data.planCategories.map((group) => {
            const totals = groupTotals(group)
            return (
              <div key={group.key} className="flex flex-col">
                <div className="mt-4 grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] items-center gap-x-4 px-7 py-2 text-body font-medium">
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className={`size-2 rounded-[2px] ${group.colorClass}`} />
                    {t(`plan.groups2.${group.key}`)}
                  </span>
                  <span className="text-right">
                    <MoneyText value={totals.budgeted} fractionDigits="none" />
                  </span>
                  <span className="text-right">
                    <MoneyText value={totals.spent} fractionDigits="none" />
                  </span>
                  <span className="text-right">
                    <MoneyText value={totals.remaining} tone="overspent" fractionDigits="none" />
                  </span>
                </div>
                {group.lines.map((line) => {
                  const remaining = line.budgeted.minus(line.spent)
                  return (
                    <div
                      key={line.id}
                      className="mx-3 grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] items-center gap-x-4 rounded-control px-4 py-2.5 text-body hover:bg-inset"
                    >
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className="truncate text-ink-2">{t(`categories.${line.id}`)}</span>
                        <ProgressBar
                          className="max-w-[260px]"
                          value={line.spent.amount.dividedBy(line.budgeted.amount)}
                          marker={data.plan.elapsed}
                          tone={remaining.isNegative() ? 'negative' : 'pace'}
                          label={t(`categories.${line.id}`)}
                        />
                      </span>
                      <span className="text-right text-ink-2">
                        <MoneyText value={line.budgeted} fractionDigits="none" />
                      </span>
                      <span className="text-right text-ink-2">
                        <MoneyText value={line.spent} fractionDigits="none" />
                      </span>
                      <span className="text-right">
                        <MoneyText value={remaining} tone="overspent" fractionDigits="none" />
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </Panel>

      <div className="flex flex-wrap gap-5">
        <Panel title={t('plan.mix')} meta={t('plan.mixNote')} className="flex-[1.2] basis-[26rem]">
          <div className="flex flex-col gap-5">
            {data.allocationMix.map((row) => (
              <div key={row.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-body">
                  <span className="text-ink">{t(`plan.mixRows.${row.key}`)}</span>
                  <span className="text-ink-2">
                    <PercentText value={row.share} fractionDigits={1} />
                    <span className="text-ink-3">
                      {' · '}
                      {t('plan.guideline')} <PercentText value={row.guideline} fractionDigits={0} />
                    </span>
                  </span>
                </div>
                <ProgressBar
                  value={row.share}
                  marker={row.guideline}
                  tone="accent"
                  label={t(`plan.mixRows.${row.key}`)}
                />
                <p className="m-0 text-caption text-ink-3">{t(`plan.mixDesc.${row.key}`)}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t('plan.changes')} className="flex-1 basis-[20rem]">
          <dl className="m-0 flex flex-col gap-3.5">
            {[
              { key: 'investments', amount: Money.of('1000', 'TRY') },
              { key: 'groceries', amount: Money.of('500', 'TRY') },
              { key: 'pool', amount: Money.of('-1000', 'TRY') },
              { key: 'sinkingFunds', amount: Money.of('-500', 'TRY') },
            ].map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-3 text-body">
                <dt className="text-ink-2">{t(`plan.changeRows.${row.key}`)}</dt>
                <dd className="m-0">
                  <MoneyText
                    value={row.amount}
                    tone="signed"
                    signDisplay="always"
                    fractionDigits="none"
                  />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <p className="m-0 text-caption text-ink-3">{t('home.sampleNote', { phase: 6 })}</p>
    </PageContainer>
  )
}
