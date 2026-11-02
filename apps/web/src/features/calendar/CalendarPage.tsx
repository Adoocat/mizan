import { moneyFromDto, type OccurrenceDto, type RecurringRuleDto } from '@mizan/contracts'
import { Money, todayIn } from '@mizan/domain'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoneyText } from '../../components/finance/MoneyText'
import { PageContainer, PageHeader } from '../../components/layout/AppShell'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { FormError } from '../../components/ui/Field'
import { Panel } from '../../components/ui/Panel'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatTiles } from '../../components/ui/StatTiles'
import { browserClock } from '../../lib/clock'
import { useFormatDate } from '../../lib/format-date'
import { useAccounts } from '../accounts/api'
import { useCurrentSession } from '../auth/session'
import { useCategories } from '../categories/api'
import { useCategoryOptions } from '../categories/names'
import { useGoals } from '../goals/api'
import { ConfirmOccurrenceDialog } from '../recurring/ConfirmOccurrenceDialog'
import { RuleFormDialog } from '../recurring/RuleFormDialog'
import { UpcomingList } from './UpcomingList'
import {
  useDeleteRule,
  useEndRule,
  usePauseRule,
  useRecurringRules,
  useResumeRule,
  useUpcoming,
} from '../recurring/api'

/** The windows §13 asks for: "7/30-day list with confirm/skip/override". */
const WINDOWS = [7, 30] as const

/** One rule in the "Recurring each month" panel, with everything it can be told to do. */
function RuleRow({ rule, onEdit }: { rule: RecurringRuleDto; onEdit: () => void }) {
  const { t } = useTranslation()
  const formatDate = useFormatDate()
  const pause = usePauseRule(rule.id)
  const resume = useResumeRule(rule.id)
  const end = useEndRule(rule.id)
  const remove = useDeleteRule(rule.id)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-divider py-3 first:border-t-0">
      <span className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body text-ink">{rule.name}</span>
          <Badge tone="neutral">{t(`recurring.kinds.${rule.kind}`)}</Badge>
          {rule.status === 'paused' && <Badge tone="warning">{t('recurring.paused')}</Badge>}
          {rule.finished && <Badge tone="neutral">{t('recurring.finished')}</Badge>}
          {rule.autoPost && <Badge tone="positive">{t('recurring.autoPost')}</Badge>}
        </span>
        <span className="text-caption text-ink-3">
          {t(`recurring.schedule.${rule.freq}`, { count: rule.interval })}
          {rule.nextDueDate && (
            <> · {t('recurring.next', { date: formatDate(rule.nextDueDate) })}</>
          )}
          {rule.amountMode === 'estimated' && ` · ${t('upcoming.estimated')}`}
        </span>
      </span>

      <span className="flex-none text-body text-ink">
        {rule.amountMode === 'estimated' && '~'}
        <MoneyText value={moneyFromDto(rule.amount)} fractionDigits="none" />
        <span className="text-caption text-ink-3">
          {' '}
          · <MoneyText value={moneyFromDto(rule.monthlyEquivalent)} fractionDigits="none" />
          {t('recurring.perMonthSuffix')}
        </span>
      </span>

      <span className="flex flex-none flex-wrap gap-2">
        <Button variant="secondary" onClick={onEdit}>
          {t('recurring.edit')}
        </Button>
        {rule.status === 'paused' ? (
          <Button variant="secondary" loading={resume.isPending} onClick={() => resume.mutate()}>
            {t('recurring.resume')}
          </Button>
        ) : (
          <Button variant="secondary" loading={pause.isPending} onClick={() => pause.mutate({})}>
            {t('recurring.pause')}
          </Button>
        )}
        {!rule.finished && (
          <Button variant="secondary" loading={end.isPending} onClick={() => end.mutate({})}>
            {t('recurring.end')}
          </Button>
        )}
        <Button variant="secondary" onClick={() => setConfirmingDelete(true)}>
          {t('recurring.delete')}
        </Button>
      </span>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t('recurring.deleteTitle', { name: rule.name })}
        description={t('recurring.deleteBody')}
        confirmLabel={t('recurring.delete')}
        destructive
        onConfirm={() => remove.mutate()}
      />
    </li>
  )
}

/**
 * Upcoming (PLAN §13): the recurring rules, and the next 7 or 30 days of what they expect.
 *
 * The month grid and the lowest-projected-balance figure the 2.0 mockup shows are **not** here.
 * Both need a day-by-day balance projection, which arrives with the calendar grid in v1.1
 * (§20, phase 19); a grid whose own legend promises "Paid" while quietly omitting what was paid
 * would be worse than no grid. What the MVP owes this page is the list and the rules behind it.
 */
export function CalendarPage() {
  const { t } = useTranslation()
  const { workspace } = useCurrentSession()
  const currency = workspace.baseCurrency
  const formatDate = useFormatDate()

  const [days, setDays] = useState<(typeof WINDOWS)[number]>(7)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<RecurringRuleDto | null>(null)
  const [confirming, setConfirming] = useState<OccurrenceDto | null>(null)

  const upcoming = useUpcoming(days)
  // The API is the authority on what today is (it owns the workspace's time zone); the browser
  // only fills the gap while the first request is in flight.
  const today = upcoming.data?.today ?? todayIn(browserClock)
  const rules = useRecurringRules()
  const accounts = useAccounts(true)
  const categories = useCategories()
  const goals = useGoals()

  const categoryOptions = useCategoryOptions(categories.data)
  const nameOf = (accountId: string) =>
    accounts.data?.accounts.find((account) => account.id === accountId)?.name ?? ''
  const categoryNameOf = (categoryId: string | null) =>
    categoryId === null
      ? t('upcoming.noCategory')
      : (categoryOptions.find((option) => option.id === categoryId)?.label ?? '')

  const zero = Money.zero(currency)
  const data = upcoming.data
  const committedMonthly = rules.data ? moneyFromDto(rules.data.committedMonthly) : zero
  const liveRules = rules.data?.rules ?? []
  const onBudgetAccounts = (accounts.data?.accounts ?? []).filter(
    (account) => account.archivedAt === null,
  )

  const occurrenceList = (items: readonly OccurrenceDto[]) => (
    <UpcomingList
      items={items}
      nameOf={nameOf}
      categoryNameOf={categoryNameOf}
      onConfirm={setConfirming}
    />
  )

  return (
    <PageContainer>
      <PageHeader
        eyebrow={t('upcoming.eyebrow')}
        title={t('pages.upcoming.title')}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            {t('upcoming.addRecurring')}
          </Button>
        }
      />

      {(upcoming.error || rules.error) && <FormError>{t('upcoming.loadFailed')}</FormError>}

      <StatTiles
        tiles={[
          {
            key: 'due',
            label: t('upcoming.tiles.next', { days }),
            value: (
              <MoneyText value={data ? moneyFromDto(data.dueTotal) : zero} fractionDigits="none" />
            ),
            // Payments, not every occurrence: the figure above it is the expenses alone.
            note: t('upcoming.dueNote', {
              count: data?.occurrences.filter((one) => one.kind !== 'income').length ?? 0,
            }),
          },
          {
            key: 'overdue',
            label: t('upcoming.tiles.overdue'),
            value: (
              <MoneyText
                value={data ? moneyFromDto(data.overdueTotal) : zero}
                fractionDigits="none"
              />
            ),
            note: t('upcoming.overdueNote', { count: data?.overdue.length ?? 0 }),
            tone: (data?.overdue.length ?? 0) > 0 ? 'negative' : 'neutral',
          },
          {
            key: 'income',
            label: t('upcoming.tiles.income'),
            value: (
              <MoneyText
                value={data ? moneyFromDto(data.incomeTotal) : zero}
                fractionDigits="none"
                signDisplay="always"
              />
            ),
            note: data?.nextIncome
              ? t('upcoming.incomeNote', {
                  name: data.nextIncome.ruleName,
                  date: formatDate(data.nextIncome.dueDate),
                })
              : t('upcoming.noIncome'),
            tone: 'positive',
          },
          {
            key: 'committed',
            label: t('upcoming.tiles.committed'),
            value: <MoneyText value={committedMonthly} fractionDigits="none" />,
            note: t('upcoming.committedNote', { count: liveRules.length }),
          },
        ]}
      />

      {data && data.overdue.length > 0 && (
        <Panel title={t('upcoming.overdueTitle')} meta={t('upcoming.overdueLead')} flush>
          {occurrenceList(data.overdue)}
        </Panel>
      )}

      <Panel
        title={t('upcoming.schedule')}
        meta={
          data
            ? t('upcoming.range', { from: formatDate(data.from), to: formatDate(data.to) })
            : undefined
        }
        action={
          <div role="radiogroup" aria-label={t('upcoming.window')} className="flex gap-2">
            {WINDOWS.map((value) => (
              <Button
                key={value}
                role="radio"
                variant={days === value ? 'primary' : 'secondary'}
                aria-checked={days === value}
                onClick={() => setDays(value)}
              >
                {t('upcoming.windowDays', { days: value })}
              </Button>
            ))}
          </div>
        }
        flush
      >
        {upcoming.isPending ? (
          <div role="status" aria-busy aria-label={t('common.loading')} className="px-7">
            <Skeleton className="h-32 w-full rounded-card" />
          </div>
        ) : data && data.occurrences.length > 0 ? (
          <>
            {occurrenceList(data.occurrences)}
            <div className="flex flex-wrap justify-between gap-3 px-7 text-caption text-ink-3">
              <span>{t('home.checkingAfter')}</span>
              <span className="font-medium text-ink">
                <MoneyText value={moneyFromDto(data.balanceAfterUpcoming)} fractionDigits="none" />
                <span className="text-ink-3">
                  {' '}
                  {t('upcoming.fromBalance')}{' '}
                  <MoneyText value={moneyFromDto(data.onBudgetBalance)} fractionDigits="none" />
                </span>
              </span>
            </div>
          </>
        ) : (
          <div className="px-7">
            <EmptyState
              title={t('upcoming.nothingDueTitle')}
              description={t('upcoming.nothingDueBody', { days })}
            />
          </div>
        )}
      </Panel>

      <Panel
        title={t('upcoming.recurring')}
        meta={
          <>
            <MoneyText value={committedMonthly} fractionDigits="none" /> {t('upcoming.committed')}
          </>
        }
      >
        {rules.isPending ? (
          <div role="status" aria-busy aria-label={t('common.loading')}>
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        ) : liveRules.length === 0 ? (
          <EmptyState
            title={t('upcoming.emptyTitle')}
            description={t('upcoming.emptyBody')}
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                {t('upcoming.addRecurring')}
              </Button>
            }
          />
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {liveRules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} onEdit={() => setEditing(rule)} />
            ))}
          </ul>
        )}
      </Panel>

      <RuleFormDialog
        open={adding}
        onOpenChange={setAdding}
        currency={currency}
        accounts={onBudgetAccounts}
        goals={goals.data?.goals ?? []}
        today={today}
      />

      {editing && (
        <RuleFormDialog
          key={editing.id}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          rule={editing}
          currency={currency}
          accounts={onBudgetAccounts}
          goals={goals.data?.goals ?? []}
          today={today}
        />
      )}

      {confirming && (
        <ConfirmOccurrenceDialog
          key={`${confirming.ruleId}-${confirming.originalDate}`}
          open
          onOpenChange={(next) => !next && setConfirming(null)}
          occurrence={confirming}
          currency={currency}
        />
      )}
    </PageContainer>
  )
}
