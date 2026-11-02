import { moneyFromDto } from '@mizan/contracts'
import type {
  ConfirmOccurrenceInput,
  ConfirmOccurrenceResponse,
  CreateRecurringRuleInput,
  EndRecurringRuleInput,
  OccurrenceDto,
  OccurrenceResponse,
  OverrideOccurrenceInput,
  PauseRecurringRuleInput,
  RecurringListResponse,
  RecurringRuleDto,
  RuleOccurrencesResponse,
  UncoveredRecurringDto,
  UpcomingResponse,
  UpdateRecurringRuleInput,
} from '@mizan/contracts'
import {
  addDays,
  diffInDays,
  expandRecurrence,
  isFinished,
  lastSeriesDate,
  Money,
  monthlyEquivalent,
  nextDueDate,
  nthSeriesDate,
  occurrenceAt,
  onBudgetEffect,
  periodContaining,
  recurringRuleKind,
  searchTextFrom,
  seriesIndexOf,
  todayIn,
  type AmountMode,
  type Clock,
  type LedgerLine,
  type Occurrence,
  type Period,
  type PlainDate,
  type RecurrenceException,
  type RecurrenceFrequency,
  type RecurrenceRule,
  type RecurringRuleKind,
  type RecurringRuleStatus,
  type WeekendPolicy,
} from '@mizan/domain'
import type { Db } from '../../db/client.ts'
import { uuidv7 } from '../../lib/uuid.ts'
import type { RequestAuth } from '../../plugins/auth.ts'
import { badRequest, conflict, notFound } from '../../plugins/errors.ts'
import { findAccountById, findAccounts, type AccountRow } from '../accounts/repository.ts'
import { findLiveCategoryIds } from '../categories/repository.ts'
import { findGoalById } from '../goals/repository.ts'
import { insertContribution } from '../goals/repository.ts'
import { balanceFrom, insertTransaction, sumBalancesByAccount } from '../ledger/repository.ts'
import { validateTransaction } from '../ledger/service.ts'
import { findPeriodByStart } from '../plan/repository.ts'
import { assertCanWrite } from '../workspace/service.ts'
import {
  deleteException,
  deleteRule,
  findExceptions,
  findPostedOccurrences,
  findRuleById,
  findRules,
  insertRule,
  updateRule,
  upsertException,
  type RecurrenceExceptionRow,
  type RecurringRuleRow,
} from './repository.ts'

/* ----------------------------------------------------------------- context */

/**
 * Everything the occurrences of a set of rules depend on, read once (PLAN §11).
 *
 * Exceptions and posted dates are loaded for every rule in one round trip each, because the
 * Upcoming page expands every rule the workspace has and doing it per rule would be a query per
 * subscription.
 */
interface RecurringContext {
  today: PlainDate
  exceptionsByRule: Map<string, RecurrenceException[]>
  /** original date → the transaction that posted it, per rule. */
  postedByRule: Map<string, Map<string, string>>
}

/** The stored exceptions of one rule, as the domain's pure expansion takes them. */
export function toRecurrenceExceptions(
  rows: readonly RecurrenceExceptionRow[],
  currency: string,
): RecurrenceException[] {
  return rows.map((row) => toException(row, currency))
}

function toException(row: RecurrenceExceptionRow, currency: string): RecurrenceException {
  return {
    originalDate: row.originalDate as PlainDate,
    // The `recurrence_exceptions_action_known` check constraint keeps this in step with the domain.
    action: row.action === 'skip' ? 'skip' : 'override',
    overrideDate: (row.overrideDate as PlainDate | null) ?? null,
    overrideAmount:
      row.overrideAmount === null ? null : Money.of(row.overrideAmount, currency).roundToMinor(),
  }
}

async function loadContext(
  db: Db,
  auth: RequestAuth,
  clock: Clock,
  rows: readonly RecurringRuleRow[],
): Promise<RecurringContext> {
  const ids = rows.map((row) => row.id)
  const [exceptions, posted] = await Promise.all([
    findExceptions(db, auth.workspaceId, ids),
    findPostedOccurrences(db, auth.workspaceId, ids),
  ])

  const currencyByRule = new Map(rows.map((row) => [row.id, row.currency]))
  const exceptionsByRule = new Map<string, RecurrenceException[]>()
  for (const row of exceptions) {
    const currency = currencyByRule.get(row.ruleId) ?? auth.workspace.baseCurrency
    const bucket = exceptionsByRule.get(row.ruleId)
    const exception = toException(row, currency)
    if (bucket) bucket.push(exception)
    else exceptionsByRule.set(row.ruleId, [exception])
  }

  const postedByRule = new Map<string, Map<string, string>>()
  for (const row of posted) {
    const bucket = postedByRule.get(row.ruleId) ?? new Map<string, string>()
    bucket.set(row.occurrenceDate, row.transactionId)
    postedByRule.set(row.ruleId, bucket)
  }

  return { today: todayIn(clock, auth.workspace.timezone), exceptionsByRule, postedByRule }
}

/** What one rule's expansion needs from the context. */
function expansionInputs(row: RecurringRuleRow, context: RecurringContext) {
  const exceptions = context.exceptionsByRule.get(row.id) ?? []
  const posted = context.postedByRule.get(row.id) ?? new Map<string, string>()
  return { exceptions, postedDates: [...posted.keys()] as PlainDate[], posted }
}

/* ------------------------------------------------------------ the read model */

/** The stored row as the domain's pure expansion sees it. Check constraints keep the casts safe. */
export function toDomainRule(row: RecurringRuleRow): RecurrenceRule {
  return {
    freq: row.freq as RecurrenceFrequency,
    interval: row.interval,
    startDate: row.startDate as PlainDate,
    byMonthDay: row.byMonthDay,
    weekendPolicy: row.weekendPolicy as WeekendPolicy,
    endDate: (row.endDate as PlainDate | null) ?? null,
    maxCount: row.maxCount,
    status: row.status as RecurringRuleStatus,
    pausedFrom: (row.pausedFrom as PlainDate | null) ?? null,
    pausedUntil: (row.pausedUntil as PlainDate | null) ?? null,
    amount: Money.of(row.amount, row.currency).roundToMinor(),
    amountMode: row.amountMode as AmountMode,
  }
}

function toRuleDto(row: RecurringRuleRow, context: RecurringContext): RecurringRuleDto {
  const rule = toDomainRule(row)
  const { exceptions, postedDates } = expansionInputs(row, context)

  return {
    id: row.id,
    seriesId: row.seriesId,
    name: row.name,
    kind: recurringRuleKind(row.kind),
    payee: row.payee,
    notes: row.notes,
    amount: rule.amount.toDto(),
    amountMode: rule.amountMode,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    goalId: row.goalId,
    freq: rule.freq,
    interval: rule.interval,
    startDate: rule.startDate,
    byMonthDay: rule.byMonthDay,
    weekendPolicy: rule.weekendPolicy,
    endDate: rule.endDate,
    maxCount: rule.maxCount,
    status: rule.status,
    pausedFrom: rule.pausedFrom,
    pausedUntil: rule.pausedUntil,
    autoPost: row.autoPost,
    // All three are derived on every read, so none of them can drift from the schedule (ADR 0014).
    finished: isFinished(rule, context.today),
    nextDueDate: nextDueDate(rule, { today: context.today, exceptions, postedDates }),
    monthlyEquivalent: monthlyEquivalent(rule).toDto(),
    lastDate: lastSeriesDate(rule),
    createdAt: row.createdAt.toISOString(),
  }
}

function toOccurrenceDto(
  row: RecurringRuleRow,
  occurrence: Occurrence,
  context: RecurringContext,
): OccurrenceDto {
  const posted = context.postedByRule.get(row.id)
  return {
    ruleId: row.id,
    ruleName: row.name,
    kind: recurringRuleKind(row.kind),
    payee: row.payee,
    originalDate: occurrence.originalDate,
    dueDate: occurrence.dueDate,
    state: occurrence.state,
    amount: occurrence.amount.toDto(),
    estimated: occurrence.estimated,
    overridden: occurrence.overridden,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    goalId: row.goalId,
    transactionId: posted?.get(occurrence.originalDate) ?? null,
    overdueDays: occurrence.state === 'overdue' ? diffInDays(context.today, occurrence.dueDate) : 0,
  }
}

/* -------------------------------------------------------------------- reading */

export interface RecurringDependencies {
  clock: Clock
}

/** `GET /recurring` (PLAN §12). */
export async function listRules(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
): Promise<RecurringListResponse> {
  const base = auth.workspace.baseCurrency
  const rows = await findRules(db, auth.workspaceId)
  const context = await loadContext(db, auth, clock, rows)
  const rules = rows.map((row) => toRuleDto(row, context))

  return {
    rules,
    // Paused and finished rules commit nothing: there is no money to set aside for them.
    committedMonthly: Money.sum(
      rules
        .filter((rule) => rule.status === 'active' && !rule.finished)
        .map((rule) => moneyFromDto(rule.monthlyEquivalent)),
      base,
    )
      .roundToMinor()
      .toDto(),
  }
}

async function loadRule(db: Db, auth: RequestAuth, id: string): Promise<RecurringRuleRow> {
  const row = await findRuleById(db, auth.workspaceId, id)
  // Another workspace's id is indistinguishable from one that does not exist.
  if (!row) throw notFound('No such recurring rule.')
  return row
}

/** How far ahead an occurrence window may reach, so one request cannot ask for a decade. */
export const MAX_OCCURRENCE_WINDOW_DAYS = 400

/** `GET /recurring/:id/occurrences?from&to` (§12). Settled occurrences are included here. */
export async function readRuleOccurrences(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  id: string,
  query: { from?: PlainDate; to?: PlainDate },
): Promise<RuleOccurrencesResponse> {
  const row = await loadRule(db, auth, id)
  const context = await loadContext(db, auth, clock, [row])

  const period = periodContaining(context.today, auth.workspace.periodStartDay)
  const from = query.from ?? period.start
  const to = query.to ?? addDays(period.end, -1)
  if (to < from) throw badRequest('That date range ends before it starts.')
  if (diffInDays(to, from) > MAX_OCCURRENCE_WINDOW_DAYS) {
    throw badRequest(`Ask for at most ${MAX_OCCURRENCE_WINDOW_DAYS} days at a time.`)
  }

  const { exceptions, postedDates } = expansionInputs(row, context)
  const occurrences = expandRecurrence(toDomainRule(row), {
    from,
    to,
    today: context.today,
    exceptions,
    postedDates,
    // A rule's own page shows the series as it went, not only what is left to do.
    includeSettled: true,
  })

  return {
    rule: toRuleDto(row, context),
    from,
    to,
    occurrences: occurrences.map((one) => toOccurrenceDto(row, one, context)),
  }
}

export const DEFAULT_UPCOMING_DAYS = 7
export const MAX_UPCOMING_DAYS = 90

/**
 * How far back the overdue list looks (§11).
 *
 * Bounded because an unbounded one is a rule from two years ago producing twenty-four overdue
 * payments nobody will ever resolve. Three months is long enough to catch anything the user is
 * still likely to act on.
 */
export const OVERDUE_LOOKBACK_DAYS = 90

/** `GET /upcoming?days=7` (§12, flow F6): what is coming, and what was missed. */
export async function readUpcoming(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  query: { days?: number } = {},
): Promise<UpcomingResponse> {
  const base = auth.workspace.baseCurrency
  const days = query.days ?? DEFAULT_UPCOMING_DAYS

  const rows = await findRules(db, auth.workspaceId)
  const context = await loadContext(db, auth, clock, rows)
  const today = context.today
  const to = addDays(today, days - 1)

  const accounts = new Map(
    (await findAccounts(db, auth.workspaceId, { includeArchived: true })).map((row) => [
      row.id,
      row,
    ]),
  )

  const overdue: OccurrenceDto[] = []
  const upcoming: OccurrenceDto[] = []
  let effect = Money.zero(base)

  for (const row of rows) {
    const { exceptions, postedDates } = expansionInputs(row, context)
    const occurrences = expandRecurrence(toDomainRule(row), {
      from: addDays(today, -OVERDUE_LOOKBACK_DAYS),
      to,
      today,
      exceptions,
      postedDates,
    })

    for (const occurrence of occurrences) {
      const dto = toOccurrenceDto(row, occurrence, context)
      if (occurrence.state === 'overdue') overdue.push(dto)
      else upcoming.push(dto)

      /*
       * What the on-budget accounts will hold once this has happened. Overdue items count too:
       * the money has not left yet, so it is still to come off whatever the accounts hold now.
       */
      effect = effect.plus(
        onBudgetEffect({
          kind: recurringRuleKind(row.kind),
          amount: occurrence.amount,
          fromOnBudget: accounts.get(row.accountId)?.onBudget ?? false,
          toOnBudget: row.toAccountId ? accounts.get(row.toAccountId)?.onBudget : undefined,
        }),
      )
    }
  }

  // Overdue reads newest first — the most recent miss is the most likely to still be fixable.
  overdue.sort((a, b) => (a.dueDate < b.dueDate ? 1 : a.dueDate > b.dueDate ? -1 : 0))
  upcoming.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))

  const sumOf = (items: readonly OccurrenceDto[], kind: RecurringRuleKind) =>
    Money.sum(
      items.filter((one) => one.kind === kind).map((one) => moneyFromDto(one.amount)),
      base,
    )
      .roundToMinor()
      .toDto()

  const balances = await sumBalancesByAccount(db, auth.workspaceId)
  const onBudgetBalance = Money.sum(
    balances
      .filter((row) => accounts.get(row.accountId)?.onBudget)
      .map((row) => balanceFrom(row.total, base)),
    base,
  ).roundToMinor()

  return {
    today,
    from: today,
    to,
    overdue,
    occurrences: upcoming,
    overdueTotal: sumOf(overdue, 'expense'),
    dueTotal: sumOf(upcoming, 'expense'),
    incomeTotal: sumOf(upcoming, 'income'),
    transferTotal: sumOf(upcoming, 'transfer'),
    nextIncome: upcoming.find((one) => one.kind === 'income') ?? null,
    onBudgetBalance: onBudgetBalance.toDto(),
    balanceAfterUpcoming: onBudgetBalance.plus(effect).roundToMinor().toDto(),
  }
}

/* ---------------------------------------------- what the plan has to account for */

/** One rule's committed money inside a plan period, for the plan's prefill and its warnings. */
export interface PeriodCommitment {
  ruleId: string
  name: string
  kind: RecurringRuleKind
  categoryId: string | null
  goalId: string | null
  amount: Money
  occurrences: number
  /** The first occurrence's due date inside the period: what a prefilled income item expects. */
  firstDueDate: PlainDate
}

/**
 * What the recurring rules commit inside one plan period (§11).
 *
 * Settled occurrences are left in: a bill already paid this month is money the plan still has to
 * have accounted for, and leaving it out would make a prefill shrink as the month went on.
 */
export async function commitmentsInPeriod(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  period: Period,
): Promise<PeriodCommitment[]> {
  const rows = await findRules(db, auth.workspaceId)
  const context = await loadContext(db, auth, clock, rows)
  const lastDay = addDays(period.end, -1)

  const commitments: PeriodCommitment[] = []
  for (const row of rows) {
    const { exceptions, postedDates } = expansionInputs(row, context)
    const occurrences = expandRecurrence(toDomainRule(row), {
      from: period.start,
      to: lastDay,
      today: context.today,
      exceptions,
      postedDates,
      includeSettled: true,
    })
    const live = occurrences.filter((one) => one.state !== 'skipped')
    if (live.length === 0) continue

    commitments.push({
      ruleId: row.id,
      name: row.name,
      kind: recurringRuleKind(row.kind),
      categoryId: row.categoryId,
      goalId: row.goalId,
      amount: Money.sum(
        live.map((one) => one.amount),
        row.currency,
      ).roundToMinor(),
      occurrences: live.length,
      firstDueDate: live[0]!.dueDate,
    })
  }
  return commitments
}

/**
 * The warning §11 asks for: *"Netflix (Subscriptions) isn't covered by the plan"*.
 *
 * Only expense and transfer rules, and only those whose category or goal has no line of its own
 * in the period. Income is deliberately left out: expected income is planned as income items,
 * which a prefill writes, and comparing a rule against them would need a link between the two
 * that the MVP does not have.
 *
 * A category with no line is not an error — the pool covers it (§10) — which is exactly why this
 * is worth saying: that money is quietly coming out of Available to spend.
 */
export function uncoveredFrom(
  commitments: readonly PeriodCommitment[],
  covered: { categoryIds: ReadonlySet<string>; goalIds: ReadonlySet<string> },
): UncoveredRecurringDto[] {
  return commitments
    .filter((commitment) => {
      if (commitment.kind === 'income') return false
      if (commitment.goalId) return !covered.goalIds.has(commitment.goalId)
      if (commitment.categoryId) return !covered.categoryIds.has(commitment.categoryId)
      // A transfer between two of the user's own accounts commits nothing the plan has to cover.
      return false
    })
    .map((commitment) => ({
      ruleId: commitment.ruleId,
      name: commitment.name,
      kind: commitment.kind,
      categoryId: commitment.categoryId,
      goalId: commitment.goalId,
      amount: commitment.amount.toDto(),
      occurrences: commitment.occurrences,
    }))
}

/* -------------------------------------------------------------------- writing */

async function assertAccount(db: Db, auth: RequestAuth, accountId: string): Promise<AccountRow> {
  const account = await findAccountById(db, auth.workspaceId, accountId)
  // Another workspace's id is indistinguishable from one that does not exist.
  if (!account) throw notFound('No such account.')
  if (account.archivedAt) throw conflict('That account is archived.')
  if (account.currency !== auth.workspace.baseCurrency) {
    throw badRequest(`A recurring rule can only use a ${auth.workspace.baseCurrency} account.`)
  }
  return account
}

async function assertCategory(db: Db, auth: RequestAuth, categoryId: string): Promise<void> {
  const live = await findLiveCategoryIds(db, auth.workspaceId, [categoryId])
  // Archived and foreign ids are refused identically: neither may be assigned to new spending.
  if (!live.has(categoryId)) throw notFound('No such category.')
}

async function assertGoal(db: Db, auth: RequestAuth, goalId: string): Promise<void> {
  const goal = await findGoalById(db, auth.workspaceId, goalId)
  if (!goal) throw notFound('No such goal.')
  if (goal.archivedAt) throw conflict('That goal is archived.')
}

/**
 * The shape rules of a rule, as messages rather than constraint violations.
 *
 * The check constraints behind these make the bad rows unwritable; this is what gives the person
 * at the keyboard something they can act on.
 */
async function assertRuleShape(
  db: Db,
  auth: RequestAuth,
  shape: {
    kind: RecurringRuleKind
    accountId: string
    toAccountId: string | null
    categoryId: string | null
    goalId: string | null
    freq: RecurrenceFrequency
    byMonthDay: number | null
    amountMode: AmountMode
    autoPost: boolean
  },
): Promise<void> {
  const account = await assertAccount(db, auth, shape.accountId)

  /*
   * An on-budget expense or income needs a category, the same way the transaction it will become
   * does (the ledger's `categoryRequired` invariant, §10).
   *
   * Checked when the rule is written rather than when an occurrence is confirmed: a rule that
   * cannot be confirmed is not a rule, and finding that out a month later — with the bill due and
   * the Confirm button refusing — is the worst possible moment to be told.
   */
  if (shape.kind !== 'transfer' && account.onBudget && !shape.categoryId) {
    throw badRequest('Choose a category, so the plan can see where this money goes.')
  }

  if (shape.kind === 'transfer') {
    if (!shape.toAccountId) throw badRequest('A transfer needs an account to move the money to.')
    if (shape.toAccountId === shape.accountId) {
      throw badRequest('A transfer needs two different accounts.')
    }
    await assertAccount(db, auth, shape.toAccountId)
  }

  if (shape.categoryId) await assertCategory(db, auth, shape.categoryId)
  if (shape.goalId) await assertGoal(db, auth, shape.goalId)

  /*
   * A goal-funded expense still needs a category (the ledger's `goalNeedsCategory` invariant): it
   * is still spending, and the Transactions page still has to be able to classify it.
   */
  if (shape.goalId && shape.kind !== 'transfer' && !shape.categoryId) {
    throw badRequest('Spending funded from a goal still needs a category.')
  }
  if (shape.byMonthDay !== null && shape.freq !== 'monthly') {
    throw badRequest('Only a monthly rule has a day of the month.')
  }
  if (shape.autoPost && shape.amountMode !== 'fixed') {
    throw badRequest('An estimated amount cannot post itself. Confirm it when the bill arrives.')
  }
}

/** `POST /recurring` (§11). Idempotent on a client-supplied id (§12). */
export async function createRule(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  input: CreateRecurringRuleInput,
): Promise<{ rule: RecurringRuleDto; created: boolean }> {
  assertCanWrite(auth)

  const id = input.id ?? uuidv7()
  const existing = await findRuleById(db, auth.workspaceId, id)
  if (existing) {
    return {
      rule: toRuleDto(existing, await loadContext(db, auth, clock, [existing])),
      created: false,
    }
  }

  const amount = moneyFromDto(input.amount)
  if (amount.currency !== auth.workspace.baseCurrency) {
    throw badRequest(`Amounts must be in ${auth.workspace.baseCurrency}.`)
  }

  const toAccountId = input.kind === 'transfer' ? input.toAccountId : null
  const categoryId = input.kind === 'transfer' ? null : (input.categoryId ?? null)
  const amountMode = input.amountMode ?? 'fixed'
  const autoPost = input.autoPost ?? false

  await assertRuleShape(db, auth, {
    kind: input.kind,
    accountId: input.accountId,
    toAccountId,
    categoryId,
    goalId: input.goalId ?? null,
    freq: input.freq,
    byMonthDay: input.byMonthDay ?? null,
    amountMode,
    autoPost,
  })

  const inserted = await insertRule(db, {
    id,
    workspaceId: auth.workspaceId,
    // The first rule of a series is its own series: a "this and future" edit adds to it later.
    seriesId: id,
    name: input.name,
    kind: input.kind,
    payee: input.payee?.trim() ? input.payee.trim() : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    amount: amount.roundToMinor().toDto().amount,
    currency: auth.workspace.baseCurrency,
    amountMode,
    accountId: input.accountId,
    toAccountId,
    categoryId,
    goalId: input.goalId ?? null,
    freq: input.freq,
    interval: input.interval ?? 1,
    startDate: input.startDate,
    byMonthDay: input.byMonthDay ?? null,
    weekendPolicy: input.weekendPolicy ?? 'none',
    endDate: input.endDate ?? null,
    maxCount: input.maxCount ?? null,
    autoPost,
    createdBy: auth.userId,
  })
  if (!inserted) throw conflict('That rule could not be created. Try again.')

  return {
    rule: toRuleDto(inserted, await loadContext(db, auth, clock, [inserted])),
    created: true,
  }
}

/** The patch the repository takes, built from what the request actually sent. */
function patchFrom(
  row: RecurringRuleRow,
  input: UpdateRecurringRuleInput,
  amount: Money | undefined,
) {
  const kind = recurringRuleKind(row.kind)
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.payee === undefined ? {} : { payee: input.payee?.trim() || null }),
    ...(input.notes === undefined ? {} : { notes: input.notes?.trim() || null }),
    ...(amount === undefined ? {} : { amount: amount.roundToMinor().toDto().amount }),
    ...(input.amountMode === undefined ? {} : { amountMode: input.amountMode }),
    ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
    // Only a transfer has a destination, and only something that is not a transfer has a category.
    ...(input.toAccountId === undefined || kind !== 'transfer'
      ? {}
      : { toAccountId: input.toAccountId }),
    ...(input.categoryId === undefined || kind === 'transfer'
      ? {}
      : { categoryId: input.categoryId }),
    ...(input.goalId === undefined ? {} : { goalId: input.goalId }),
    ...(input.freq === undefined ? {} : { freq: input.freq }),
    ...(input.interval === undefined ? {} : { interval: input.interval }),
    ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
    ...(input.byMonthDay === undefined ? {} : { byMonthDay: input.byMonthDay }),
    ...(input.weekendPolicy === undefined ? {} : { weekendPolicy: input.weekendPolicy }),
    ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
    ...(input.maxCount === undefined ? {} : { maxCount: input.maxCount }),
    ...(input.autoPost === undefined ? {} : { autoPost: input.autoPost }),
  }
}

/** The fields that change which dates the series falls on. */
const SCHEDULE_FIELDS = ['freq', 'interval', 'startDate', 'byMonthDay'] as const

/**
 * `PATCH /recurring/:id` (§11).
 *
 * `scope: "all"` edits in place. Posted occurrences are never rewritten by it — they are
 * transactions, and raising the rent in July must not restate what June's rent was.
 *
 * `scope: "future"` is the split: the current rule is ended the day before the first occurrence
 * that changes, and a new rule with the same `seriesId` takes over from there. The new rule
 * inherits no count of its own — "the next six payments" counted from a start that has moved means
 * nothing — so a counted series being split should say how many are left.
 */
export async function patchRule(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  id: string,
  input: UpdateRecurringRuleInput,
): Promise<RecurringRuleDto> {
  assertCanWrite(auth)
  const row = await loadRule(db, auth, id)

  const amount = input.amount === undefined ? undefined : moneyFromDto(input.amount)
  if (amount && amount.currency !== auth.workspace.baseCurrency) {
    throw badRequest(`Amounts must be in ${auth.workspace.baseCurrency}.`)
  }

  const kind = recurringRuleKind(row.kind)
  if (input.toAccountId !== undefined && kind !== 'transfer') {
    throw badRequest('Only a transfer moves money to another account.')
  }
  if (input.categoryId !== undefined && kind === 'transfer') {
    throw badRequest('A transfer between your own accounts has no category.')
  }

  const patch = patchFrom(row, input, amount)
  const merged = { ...row, ...patch }
  await assertRuleShape(db, auth, {
    kind,
    accountId: merged.accountId,
    toAccountId: merged.toAccountId,
    categoryId: merged.categoryId,
    goalId: merged.goalId,
    freq: merged.freq as RecurrenceFrequency,
    byMonthDay: merged.byMonthDay,
    amountMode: merged.amountMode as AmountMode,
    autoPost: merged.autoPost,
  })

  if (input.scope !== 'future') {
    const updated = await updateRule(db, auth.workspaceId, id, patch)
    if (!updated) throw notFound('No such recurring rule.')
    return toRuleDto(updated, await loadContext(db, auth, clock, [updated]))
  }

  const anchor = splitAnchor(row, input)
  if (anchor === null) {
    throw badRequest('This rule has no occurrence on or after that date to change.')
  }
  // Nothing of the old rule would survive the split, so there is nothing to preserve.
  if (anchor <= (row.startDate as PlainDate)) {
    const updated = await updateRule(db, auth.workspaceId, id, patch)
    if (!updated) throw notFound('No such recurring rule.')
    return toRuleDto(updated, await loadContext(db, auth, clock, [updated]))
  }

  const created = await db.transaction(async (tx) => {
    const ended = await updateRule(tx, auth.workspaceId, id, { endDate: addDays(anchor, -1) })
    if (!ended) throw notFound('No such recurring rule.')

    const next = await insertRule(tx, {
      id: uuidv7(),
      workspaceId: auth.workspaceId,
      seriesId: row.seriesId,
      name: merged.name,
      kind: row.kind,
      payee: merged.payee,
      notes: merged.notes,
      amount: merged.amount,
      currency: row.currency,
      amountMode: merged.amountMode,
      accountId: merged.accountId,
      toAccountId: merged.toAccountId,
      categoryId: merged.categoryId,
      goalId: merged.goalId,
      freq: merged.freq,
      interval: merged.interval,
      startDate: anchor,
      byMonthDay: merged.byMonthDay,
      weekendPolicy: merged.weekendPolicy,
      endDate: (merged.endDate as PlainDate | null) ?? null,
      maxCount: input.maxCount ?? null,
      autoPost: merged.autoPost,
      createdBy: auth.userId,
    })
    if (!next) throw conflict('That rule could not be split. Try again.')
    return next
  })

  return toRuleDto(created, await loadContext(db, auth, clock, [created]))
}

/**
 * Where a "this and future" split falls.
 *
 * The first occurrence of the **old** schedule on or after `from`, so the series stays on the
 * dates the user is looking at: editing the rent from July keeps it on the 1st. When the patch
 * changes the schedule itself there is no old date to keep, and `from` is the new anchor.
 */
function splitAnchor(row: RecurringRuleRow, input: UpdateRecurringRuleInput): PlainDate | null {
  const from = input.from!
  if (SCHEDULE_FIELDS.some((field) => input[field] !== undefined)) return from

  const rule = toDomainRule(row)
  for (let index = 0; ; index += 1) {
    if (rule.maxCount !== null && index >= rule.maxCount) return null
    const occurrence = nthSeriesDate(rule, index)
    if (rule.endDate !== null && occurrence > rule.endDate) return null
    if (occurrence >= from) return occurrence
  }
}

/** `POST /recurring/:id/pause` and `/resume` (§11). */
export async function setRulePaused(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  id: string,
  paused: boolean,
  input: PauseRecurringRuleInput = {},
): Promise<RecurringRuleDto> {
  assertCanWrite(auth)
  await loadRule(db, auth, id)
  const today = todayIn(clock, auth.workspace.timezone)

  const from = input.from ?? today
  if (paused && input.until !== undefined && input.until <= from) {
    throw badRequest('A pause has to end after it starts.')
  }

  const updated = await updateRule(db, auth.workspaceId, id, {
    status: paused ? 'paused' : 'active',
    // Resuming clears the window, which the `pause_matches_status` constraint also insists on.
    pausedFrom: paused ? from : null,
    pausedUntil: paused ? (input.until ?? null) : null,
  })
  if (!updated) throw notFound('No such recurring rule.')
  return toRuleDto(updated, await loadContext(db, auth, clock, [updated]))
}

/**
 * `POST /recurring/:id/end` (§11): the series stops after `on`, which defaults to today.
 *
 * Ending is not deleting. Everything the rule already posted stays, its occurrences up to that
 * date stay confirmable, and `finished` follows from the date rather than from a flag.
 */
export async function endRule(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  id: string,
  input: EndRecurringRuleInput = {},
): Promise<RecurringRuleDto> {
  assertCanWrite(auth)
  const row = await loadRule(db, auth, id)
  const on = input.on ?? todayIn(clock, auth.workspace.timezone)

  if (on < (row.startDate as PlainDate)) {
    throw badRequest('A rule cannot end before it starts. Delete it instead.')
  }

  const updated = await updateRule(db, auth.workspaceId, id, { endDate: on })
  if (!updated) throw notFound('No such recurring rule.')
  return toRuleDto(updated, await loadContext(db, auth, clock, [updated]))
}

/**
 * `DELETE /recurring/:id`: for a rule that should never have existed.
 *
 * The transactions it already posted are left exactly as they are — the money moved, whatever
 * became of the prediction — so a rule that has served its purpose should be *ended* rather than
 * deleted. Its exceptions go with it: a skip means nothing without the series it skipped.
 */
export async function removeRule(db: Db, auth: RequestAuth, id: string): Promise<void> {
  assertCanWrite(auth)
  await loadRule(db, auth, id)
  if (!(await deleteRule(db, auth.workspaceId, id))) throw notFound('No such recurring rule.')
}

/* ------------------------------------------------------------- occurrences */

/** One occurrence of one rule, resolved from a URL and checked against the series. */
interface ResolvedOccurrence {
  row: RecurringRuleRow
  rule: RecurrenceRule
  context: RecurringContext
  occurrence: Occurrence
  /** The exception already on this occurrence, if any. */
  exception: RecurrenceException | undefined
  /** The transaction that posted it, if it is posted. */
  transactionId: string | undefined
}

/**
 * Resolves `/recurring/:id/occurrences/:date` into something the writes can act on.
 *
 * `date` is the occurrence's **original** date and has to be one the series actually produces: it
 * arrives from a URL, and an occurrence a rule never had must be refused rather than invented.
 */
async function resolveOccurrence(
  db: Db,
  auth: RequestAuth,
  clock: Clock,
  id: string,
  originalDate: PlainDate,
): Promise<ResolvedOccurrence> {
  const row = await loadRule(db, auth, id)
  const rule = toDomainRule(row)
  if (seriesIndexOf(rule, originalDate) === null) {
    throw notFound('This rule has no occurrence on that date.')
  }

  const context = await loadContext(db, auth, clock, [row])
  const { exceptions, postedDates, posted } = expansionInputs(row, context)

  // A lookup by the occurrence's identity, so an override that moved its due date by a year
  // does not make it any harder to find.
  const occurrence = occurrenceAt(rule, originalDate, {
    today: context.today,
    exceptions,
    postedDates,
  })
  if (!occurrence) throw conflict('That occurrence is paused. Resume the rule first.')

  return {
    row,
    rule,
    context,
    occurrence,
    exception: exceptions.find((one) => one.originalDate === originalDate),
    transactionId: posted.get(originalDate),
  }
}

function occurrenceResponse(resolved: ResolvedOccurrence): OccurrenceResponse {
  return {
    rule: toRuleDto(resolved.row, resolved.context),
    occurrence: toOccurrenceDto(resolved.row, resolved.occurrence, resolved.context),
  }
}

/** Postgres `unique_violation`: the duplicate check behind `transactions_occurrence_key`. */
const UNIQUE_VIOLATION = '23505'

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  )
}

/**
 * Confirms one occurrence: records that the money actually moved (flow F6).
 *
 * The transaction carries the rule and the original date, and that pair is the only record that
 * the occurrence is posted. Exactly one transaction comes out of it however many times this is
 * called — the partial unique index refuses the second, and a refusal is read as "already done"
 * rather than as an error, which is what makes the button safe to double-tap and the auto-post
 * job safe to run beside a user doing it by hand.
 *
 * A transfer rule with a goal records the transfer **and** the goal contribution together, which
 * is §11's auto-transfer-to-goals and flow F8's second funding route.
 */
export async function confirmOccurrence(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  id: string,
  originalDate: PlainDate,
  input: ConfirmOccurrenceInput,
): Promise<ConfirmOccurrenceResponse> {
  assertCanWrite(auth)
  const resolved = await resolveOccurrence(db, auth, clock, id, originalDate)
  const { row, occurrence } = resolved

  if (resolved.transactionId) {
    return {
      ...occurrenceResponse(resolved),
      transactionId: resolved.transactionId,
      alreadyPosted: true,
    }
  }
  if (occurrence.state === 'skipped') {
    throw conflict('That occurrence was skipped. Clear the skip before confirming it.')
  }

  const amount = input.amount === undefined ? occurrence.amount : moneyFromDto(input.amount)
  if (amount.currency !== auth.workspace.baseCurrency) {
    throw badRequest(`Amounts must be in ${auth.workspace.baseCurrency}.`)
  }
  if (!amount.isPositive()) throw badRequest('A confirmed amount has to be more than zero.')

  const date = input.date ?? occurrence.dueDate
  const accountId = input.accountId ?? row.accountId
  const account = await assertAccount(db, auth, accountId)
  const categoryId = input.categoryId ?? row.categoryId
  if (input.categoryId) await assertCategory(db, auth, input.categoryId)

  const kind = recurringRuleKind(row.kind)
  const notes = input.notes?.trim() ? input.notes.trim() : row.notes
  const transactionId = input.transactionId ?? uuidv7()
  const lines = occurrenceLines({
    kind,
    row,
    from: account,
    to: row.toAccountId ? await assertAccount(db, auth, row.toAccountId) : undefined,
    accountId,
    categoryId,
    amount,
  })

  validateTransaction({ type: kind, lines })

  try {
    await writeOccurrence(db, {
      workspaceId: auth.workspaceId,
      periodStartDay: auth.workspace.periodStartDay,
      createdBy: auth.userId,
      row,
      originalDate,
      date,
      amount,
      notes,
      transactionId,
      lines,
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    /*
     * Something posted this occurrence between the check above and the insert — a second tap, a
     * retry, or the auto-post job. The index did its job; re-read and answer as though this call
     * had been the one that found it already posted.
     */
    const again = await resolveOccurrence(db, auth, clock, id, originalDate)
    if (!again.transactionId) throw error
    return {
      ...occurrenceResponse(again),
      transactionId: again.transactionId,
      alreadyPosted: true,
    }
  }

  return {
    ...occurrenceResponse(await resolveOccurrence(db, auth, clock, id, originalDate)),
    transactionId,
    alreadyPosted: false,
  }
}

/**
 * The ledger lines a confirmed occurrence becomes.
 *
 * The rule holds a magnitude and the kind decides the sign, exactly as the quick-add form does —
 * one fewer thing that can disagree between the two ways a transaction gets written (§6). Pure,
 * so the auto-post worker and a user tapping Confirm cannot produce different lines.
 */
export function occurrenceLines(input: {
  kind: RecurringRuleKind
  row: RecurringRuleRow
  from: AccountRow
  to: AccountRow | undefined
  accountId: string
  categoryId: string | null
  amount: Money
}): LedgerLine[] {
  if (input.kind === 'transfer') {
    if (!input.to) throw badRequest('A transfer needs an account to move the money to.')
    return [
      {
        accountId: input.accountId,
        amount: input.amount.negate(),
        categoryId: null,
        onBudget: input.from.onBudget,
      },
      {
        accountId: input.to.id,
        amount: input.amount,
        categoryId: null,
        onBudget: input.to.onBudget,
      },
    ]
  }

  return [
    {
      accountId: input.accountId,
      amount: input.kind === 'expense' ? input.amount.negate() : input.amount,
      categoryId: input.categoryId,
      // Funded from a goal: the spending draws down that earmark instead of this month's plan.
      goalId: input.row.goalId,
      onBudget: input.from.onBudget,
    },
  ]
}

export interface OccurrencePosting {
  workspaceId: string
  periodStartDay: number
  /** Null when nobody was there: the worker posts on the rule's behalf. */
  createdBy: string | null
  row: RecurringRuleRow
  /** The occurrence's series date, which is what makes the write idempotent. */
  originalDate: PlainDate
  /** The date the money moved, which may be later than the occurrence was due. */
  date: PlainDate
  amount: Money
  notes: string | null
  transactionId: string
  lines: readonly LedgerLine[]
}

/**
 * Writes what a confirmed occurrence leaves behind: one transaction, and for a transfer rule with
 * a goal, the contribution that goes with it (§11, flow F8).
 *
 * Both in one database transaction, so a confirmed transfer can never leave the money moved
 * without the earmark recorded. Shared by the Confirm button and the auto-post worker, which is
 * what makes "confirming creates exactly one transaction" true of both.
 */
export async function writeOccurrence(db: Db, posting: OccurrencePosting): Promise<void> {
  const { row } = posting
  const kind = recurringRuleKind(row.kind)

  await db.transaction(async (tx) => {
    await insertTransaction(tx, {
      id: posting.transactionId,
      workspaceId: posting.workspaceId,
      createdBy: posting.createdBy,
      type: kind,
      date: posting.date,
      lines: posting.lines,
      /*
       * The rule's name labels what it records when no payee was given.
       *
       * A rule is already called "Rent" or "Netflix" — the name is payee-shaped — and the
       * alternative is a transaction with nothing on it but a category, which is exactly what an
       * auto-posted row would look like in the ledger if nobody had typed a payee.
       */
      payee: row.payee ?? row.name,
      notes: posting.notes,
      searchText: searchTextFrom([row.payee ?? row.name, posting.notes]),
      source: 'recurring',
      recurringRuleId: row.id,
      occurrenceDate: posting.originalDate,
    })

    if (kind === 'transfer' && row.goalId) {
      const period = periodContaining(posting.date, posting.periodStartDay)
      const periodRow = await findPeriodByStart(tx, posting.workspaceId, period.start)
      await insertContribution(tx, {
        id: uuidv7(),
        workspaceId: posting.workspaceId,
        goalId: row.goalId,
        date: posting.date,
        amount: posting.amount.roundToMinor().toDto().amount,
        currency: row.currency,
        source: 'transfer',
        transactionId: posting.transactionId,
        periodId: periodRow?.id ?? null,
        note: row.name,
      })
    }
  })
}

/** `POST /recurring/:id/occurrences/:date/skip` (flow F6). Idempotent: skipping twice is a skip. */
export async function skipOccurrence(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  id: string,
  originalDate: PlainDate,
): Promise<OccurrenceResponse> {
  assertCanWrite(auth)
  const resolved = await resolveOccurrence(db, auth, clock, id, originalDate)
  if (resolved.transactionId) {
    throw conflict('That occurrence is already recorded. Delete the transaction to undo it.')
  }

  await upsertException(db, {
    workspaceId: auth.workspaceId,
    ruleId: id,
    originalDate,
    action: 'skip',
    overrideDate: null,
    overrideAmount: null,
  })

  return occurrenceResponse(await resolveOccurrence(db, auth, clock, id, originalDate))
}

/**
 * `POST /recurring/:id/occurrences/:date/override`: §11's "only this" (flow F6).
 *
 * The month the rent was higher, or the bill was paid three days late. The series date stays what
 * it was, so the occurrence keeps its identity and next month is unaffected.
 */
export async function overrideOccurrence(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  id: string,
  originalDate: PlainDate,
  input: OverrideOccurrenceInput,
): Promise<OccurrenceResponse> {
  assertCanWrite(auth)
  const resolved = await resolveOccurrence(db, auth, clock, id, originalDate)
  if (resolved.transactionId) {
    throw conflict('That occurrence is already recorded. Edit the transaction instead.')
  }

  const amount = input.amount === undefined ? undefined : moneyFromDto(input.amount)
  if (amount && amount.currency !== auth.workspace.baseCurrency) {
    throw badRequest(`Amounts must be in ${auth.workspace.baseCurrency}.`)
  }

  await upsertException(db, {
    workspaceId: auth.workspaceId,
    ruleId: id,
    originalDate,
    action: 'override',
    overrideDate: input.date ?? null,
    overrideAmount: amount ? amount.roundToMinor().toDto().amount : null,
  })

  return occurrenceResponse(await resolveOccurrence(db, auth, clock, id, originalDate))
}

/**
 * `DELETE /recurring/:id/occurrences/:date/exception`: puts the occurrence back as the schedule
 * had it — un-skip, or drop an override.
 */
export async function clearOccurrenceException(
  db: Db,
  auth: RequestAuth,
  { clock }: RecurringDependencies,
  id: string,
  originalDate: PlainDate,
): Promise<OccurrenceResponse> {
  assertCanWrite(auth)
  const resolved = await resolveOccurrence(db, auth, clock, id, originalDate)
  if (!resolved.exception) throw notFound('That occurrence has nothing to clear.')

  await deleteException(db, auth.workspaceId, id, originalDate)
  return occurrenceResponse(await resolveOccurrence(db, auth, clock, id, originalDate))
}
