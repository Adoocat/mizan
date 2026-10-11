import { moneyFromDto, type GoalDto, type OverEarmarkedAccountDto } from '@mizan/contracts'
import { decimal, formatDecimal, Money, type Decimal, type GoalStatus } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PercentText } from '../../components/finance/PercentText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { FormError } from '../../components/ui/Field'
import { Panel } from '../../components/ui/Panel'
import { Skeleton } from '../../components/ui/Skeleton'
import { useFormatDate, useFormatMonthYear } from '../../lib/format-date'
import { useNumberLocale } from '../../lib/use-locale'
import { useAccounts } from '../accounts/api'
import { useCurrentSession } from '../auth/session'
import { ContributeDialog } from './ContributeDialog'
import { GoalFormDialog } from './GoalFormDialog'
import { useAddGoalToPlan, useGoals, useSetGoalArchived } from './api'

const RADIUS = 34
/** π to enough places for an 80px ring; kept as a Decimal so no stroke length is a float. */
const CIRCUMFERENCE = decimal('3.14159265358979').times(2).times(RADIUS)

const STATUS_STROKE: Record<GoalStatus, string> = {
  funded: 'var(--m-positive)',
  onTrack: 'var(--m-positive)',
  behind: 'var(--m-warning)',
  neutral: 'var(--m-accent)',
}

const STATUS_TONE: Record<GoalStatus, BadgeTone> = {
  funded: 'positive',
  onTrack: 'positive',
  behind: 'warning',
  neutral: 'neutral',
}

/** A single goal's progress as a ring (2.0 §00: "rings for single goals"). */
function GoalRing({ share, tone }: { share: Decimal; tone: string }) {
  // The ratio becomes a stroke length here — a display boundary, like a chart coordinate.
  const capped = share.greaterThan(1) ? decimal(1) : share.isNegative() ? decimal(0) : share
  const filled = capped.times(CIRCUMFERENCE).toFixed(2)
  return (
    <svg viewBox="0 0 80 80" aria-hidden className="size-20 flex-none -rotate-90">
      <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="var(--m-track)" strokeWidth="6" />
      <circle
        cx="40"
        cy="40"
        r={RADIUS}
        fill="none"
        stroke={tone}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${CIRCUMFERENCE.toFixed(2)}`}
      />
    </svg>
  )
}

/**
 * The line under a goal's amounts: what it needs each month, or when it will get there.
 *
 * A goal with a target date needs a certain amount a month; one without says when its plan line
 * will finish the job instead. A goal with neither has nothing honest to say here, so it says
 * nothing rather than inventing a figure (§9).
 */
function GoalNote({ goal }: { goal: GoalDto }) {
  const { t } = useTranslation()
  const locale = useNumberLocale()
  const formatDate = useFormatDate()
  const formatMonth = useFormatMonthYear()

  /*
   * An emergency fund says how long it would last before anything else, including once it is
   * funded: "3.3 months of essentials" is what the fund is *for*, and more useful than knowing
   * it has passed a target that moves with the plan anyway.
   */
  if (goal.type === 'emergency_fund' && goal.coverageMonths) {
    return (
      <span className="text-ink-3">
        {t('goals.note.coverage', {
          months: formatDecimal(goal.coverageMonths, locale, { fractionDigits: 1 }),
        })}
      </span>
    )
  }
  if (goal.status === 'funded') {
    return <span className="text-positive">{t('goals.note.funded')}</span>
  }
  if (goal.requiredMonthly) {
    const required = moneyFromDto(goal.requiredMonthly)
    return (
      <span className={goal.status === 'behind' ? 'text-warning' : 'text-ink-3'}>
        {t('goals.note.requiredMonthly')} <MoneyText value={required} fractionDigits="none" />
        {goal.targetDate && <> · {t('goals.note.by', { date: formatDate(goal.targetDate) })}</>}
      </span>
    )
  }
  // No target date, but a plan line: the month that line finishes the job, derived not promised.
  if (goal.projectedFinish) {
    return (
      <span className="text-ink-3">
        {t('goals.note.projected', { date: formatMonth(goal.projectedFinish) })}
      </span>
    )
  }
  return <span className="text-ink-3">{t('goals.note.noDate')}</span>
}

function GoalCard({
  goal,
  onEdit,
  onContribute,
}: {
  goal: GoalDto
  onEdit: () => void
  onContribute: () => void
}) {
  const { t } = useTranslation()
  const archive = useSetGoalArchived(goal.id)
  const addToPlan = useAddGoalToPlan(goal.id)

  const saved = moneyFromDto(goal.saved)
  const target = moneyFromDto(goal.target)
  const share = goal.progress === null ? decimal(0) : decimal(goal.progress)

  return (
    <article className="flex flex-col gap-4 rounded-inset bg-inset p-5">
      <div className="flex items-center gap-5">
        <div className="relative flex-none">
          <GoalRing share={share} tone={STATUS_STROKE[goal.status]} />
          <span className="absolute inset-0 flex items-center justify-center text-caption font-medium text-ink">
            {goal.progress === null ? '—' : <PercentText value={share} fractionDigits={0} />}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-panel-title text-ink">{goal.name}</h3>
            <Badge tone="neutral">{t(`goals.types.${goal.type}`)}</Badge>
            {goal.archivedAt && <Badge tone="neutral">{t('goals.archived')}</Badge>}
            {!goal.archivedAt && goal.status !== 'neutral' && (
              <Badge tone={STATUS_TONE[goal.status]}>{t(`goals.status.${goal.status}`)}</Badge>
            )}
          </div>
          <p className="m-0 text-body text-ink-2">
            <MoneyText value={saved} fractionDigits="none" />
            <span className="text-ink-3">
              {' '}
              {t('goals.of')} <MoneyText value={target} fractionDigits="none" />
            </span>
          </p>
          <p className="m-0 text-caption">
            <GoalNote goal={goal} />
          </p>
          {goal.note && <p className="m-0 text-caption text-ink-3">{goal.note}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {goal.archivedAt ? (
          <Button
            variant="secondary"
            loading={archive.isPending}
            onClick={() => archive.mutate(false)}
          >
            {t('goals.unarchive')}
          </Button>
        ) : (
          <>
            <Button variant="primary" onClick={onContribute}>
              {t('goals.contribute.action')}
            </Button>
            {goal.planLineId === null && goal.requiredMonthly && (
              <Button
                variant="secondary"
                loading={addToPlan.isPending}
                onClick={() => addToPlan.mutate({})}
              >
                {t('goals.addToPlan')}
              </Button>
            )}
            {goal.planLineId !== null && goal.plannedMonthly && (
              <span className="self-center text-caption text-ink-3">
                {t('goals.inPlan')}{' '}
                <MoneyText value={moneyFromDto(goal.plannedMonthly)} fractionDigits="none" />
              </span>
            )}
            <Button variant="secondary" onClick={onEdit}>
              {t('goals.edit')}
            </Button>
            <Button
              variant="secondary"
              loading={archive.isPending}
              onClick={() => archive.mutate(true)}
            >
              {t('goals.archive')}
            </Button>
          </>
        )}
      </div>

      {addToPlan.error && <FormError>{t('goals.addToPlanFailed')}</FormError>}
    </article>
  )
}

/** The §9 warning: more is earmarked in an account than the account holds. Never a refusal. */
function OverEarmarkedNotice({
  warnings,
  nameOf,
}: {
  warnings: readonly OverEarmarkedAccountDto[]
  nameOf: (accountId: string) => string
}) {
  const { t } = useTranslation()
  if (warnings.length === 0) return null

  return (
    <Panel title={t('goals.overEarmarked.title')}>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {warnings.map((warning) => (
          <li key={warning.accountId} className="text-body text-ink-2">
            <MoneyText value={moneyFromDto(warning.excess)} fractionDigits="none" />{' '}
            {t('goals.overEarmarked.body', { account: nameOf(warning.accountId) })}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export function GoalsPage() {
  const { t } = useTranslation()
  const { workspace } = useCurrentSession()
  const currency = workspace.baseCurrency

  const [showArchived, setShowArchived] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<GoalDto | null>(null)
  const [contributing, setContributing] = useState<GoalDto | null>(null)

  const { data, isPending, error } = useGoals(showArchived)
  // The accounts a goal can be kept in, and the names the over-earmark warning needs.
  const accounts = useAccounts()

  const goals = data?.goals ?? []
  const totalSaved = data ? moneyFromDto(data.totalSaved) : Money.zero(currency)
  const essentialMonthly = data ? moneyFromDto(data.essentialMonthly) : Money.zero(currency)
  const onBudgetAccounts = (accounts.data?.accounts ?? []).filter(
    (account) => account.onBudget && account.archivedAt === null,
  )
  const nameOf = (accountId: string) =>
    accounts.data?.accounts.find((account) => account.id === accountId)?.name ?? ''

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('goals.eyebrow')}
        title={t('pages.goals.title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? t('goals.hideArchived') : t('goals.showArchived')}
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t('goals.newGoal')}
            </Button>
          </div>
        }
      />

      {error && <FormError>{t('goals.loadFailed')}</FormError>}

      {isPending ? (
        <div
          role="status"
          aria-busy
          aria-label={t('common.loading')}
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-48 w-full rounded-card" />
          <Skeleton className="h-48 w-full rounded-card" />
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          title={t('goals.emptyTitle')}
          description={t('goals.emptyBody')}
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              {t('goals.newGoal')}
            </Button>
          }
        />
      ) : (
        <>
          <Panel
            title={t('goals.summary', { count: goals.length })}
            meta={
              <>
                <MoneyText value={totalSaved} fractionDigits="none" /> {t('goals.committed')}
              </>
            }
          >
            <div className="grid gap-5 md:grid-cols-2">
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  onEdit={() => setEditing(goal)}
                  onContribute={() => setContributing(goal)}
                />
              ))}
            </div>
          </Panel>

          <OverEarmarkedNotice warnings={data?.overEarmarked ?? []} nameOf={nameOf} />
        </>
      )}

      <Panel title={t('goals.howItWorks')}>
        <p className="m-0 max-w-[60ch] text-body text-ink-2">{t('goals.howItWorksBody')}</p>
      </Panel>

      <GoalFormDialog
        open={adding}
        onOpenChange={setAdding}
        currency={currency}
        accounts={onBudgetAccounts}
        essentialMonthly={essentialMonthly}
      />

      {editing && (
        <GoalFormDialog
          key={editing.id}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          goal={editing}
          currency={currency}
          accounts={onBudgetAccounts}
          essentialMonthly={essentialMonthly}
        />
      )}

      {contributing && (
        <ContributeDialog
          key={contributing.id}
          open
          onOpenChange={(next) => !next && setContributing(null)}
          goal={contributing}
          currency={currency}
        />
      )}
    </PageContainer>
  )
}
