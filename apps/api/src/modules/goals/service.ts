import type {
  CreateContributionInput,
  CreateGoalInput,
  GoalContributionDto,
  GoalDto,
  GoalListResponse,
  GoalResponse,
  AddGoalToPlanInput,
  OverEarmarkedAccountDto,
  UpdateGoalInput,
} from '@mizan/contracts'
import { moneyFromDto } from '@mizan/contracts'
import {
  Money,
  addMonths,
  contributionMonthsLeft,
  emergencyFundCoverage,
  emergencyFundTarget,
  goalProgress,
  goalRemaining,
  goalSaved,
  goalStatus,
  goalType,
  checkContribution,
  monthsToFinish,
  overEarmarked,
  periodContaining,
  previousPeriod,
  requiredMonthly,
  todayIn,
  type Clock,
  type EmergencyFundMonths,
  type GoalRepeat,
  type GoalStatus,
  type Period,
  type PlainDate,
} from '@mizan/domain'
import type { Db } from '../../db/client.ts'
import { uuidv7 } from '../../lib/uuid.ts'
import type { RequestAuth } from '../../plugins/auth.ts'
import { badRequest, conflict, notFound } from '../../plugins/errors.ts'
import { findAccountById } from '../accounts/repository.ts'
import { sumBalancesByAccount, balanceFrom } from '../ledger/repository.ts'
import { findPeriodByStart } from '../plan/repository.ts'
import { upsertPlanLine } from '../plan/service.ts'
import { findTransactionById } from '../transactions/repository.ts'
import { assertCanWrite } from '../workspace/service.ts'
import {
  deleteContribution,
  findContributionById,
  findContributions,
  findGoalById,
  findGoalPlanLines,
  findGoals,
  insertContribution,
  insertGoal,
  sumContributionsByGoal,
  sumEssentialAllocations,
  sumEssentialSpending,
  sumGoalFundedSpendByGoal,
  updateGoal,
  type GoalContributionRow,
  type GoalPlanLineRow,
  type GoalRow,
} from './repository.ts'

/* ----------------------------------------------------------------- context */

/**
 * Everything a goal's figures depend on, read once (PLAN §9).
 *
 * The period is always the **current** one: a goal's required monthly amount is a statement about
 * the months from now to its target date, not about a month the user happens to be looking at on
 * the Plan page. The plan lines come from that same period, which is what "add to plan" writes to.
 */
interface GoalContext {
  today: PlainDate
  period: Period
  /** Absent until something has been planned this month. */
  periodId: string | undefined
  /**
   * One month of essentials as the plan states it — `Σ planned` over the essential and debt
   * lines — which is what every emergency fund's target is built from (§9).
   */
  essentialMonthly: Money
  /** What was actually spent on essentials and debt a month, averaged over three months (§9). */
  essentialActualAverage: Money
  earmarkedByGoal: Map<string, Money>
  spentByGoal: Map<string, Money>
  planLineByGoal: Map<string, GoalPlanLineRow>
}

/** How many complete months the "actual average" beside the planned essentials covers (§9). */
const ESSENTIAL_AVERAGE_MONTHS = 3

async function loadContext(db: Db, auth: RequestAuth, clock: Clock): Promise<GoalContext> {
  const base = auth.workspace.baseCurrency
  const today = todayIn(clock, auth.workspace.timezone)
  const period = periodContaining(today, auth.workspace.periodStartDay)
  const periodRow = await findPeriodByStart(db, auth.workspaceId, period.start)

  // The three whole months before this one, which is what the average is over.
  let averageFrom = period
  for (let step = 0; step < ESSENTIAL_AVERAGE_MONTHS; step += 1) {
    averageFrom = previousPeriod(averageFrom, auth.workspace.periodStartDay)
  }

  const [essentialPlanned, essentialActual, earmarks, spends, planLines] = await Promise.all([
    periodRow ? sumEssentialAllocations(db, auth.workspaceId, periodRow.id) : Promise.resolve(null),
    sumEssentialSpending(db, auth.workspaceId, { start: averageFrom.start, end: period.start }),
    sumContributionsByGoal(db, auth.workspaceId),
    sumGoalFundedSpendByGoal(db, auth.workspaceId),
    periodRow ? findGoalPlanLines(db, auth.workspaceId, periodRow.id) : Promise.resolve([]),
  ])

  return {
    today,
    period,
    periodId: periodRow?.id,
    essentialMonthly: balanceFrom(essentialPlanned, base),
    // The ledger sum is signed, so spending arrives negative and is read as money that left.
    essentialActualAverage: balanceFrom(essentialActual, base)
      .negate()
      .dividedBy(ESSENTIAL_AVERAGE_MONTHS)
      .roundToMinor(),
    earmarkedByGoal: new Map(
      earmarks.map((row) => [row.goalId, Money.of(row.total, base).roundToMinor()]),
    ),
    // Signed too: an expense out of a goal is negative, so negating gives money spent.
    spentByGoal: new Map(
      spends.map((row) => [row.goalId, Money.of(row.total, base).negate().roundToMinor()]),
    ),
    planLineByGoal: new Map(planLines.map((line) => [line.goalId, line])),
  }
}

/* -------------------------------------------------------------- the read model */

/**
 * One goal as the API returns it (§9, §16).
 *
 * `target` is where the types diverge: an emergency fund's is derived from the plan on every
 * read, so the fund it needs follows the household's real cost of living, while a savings goal
 * or sinking fund carries the figure the user typed.
 */
function toGoalDto(row: GoalRow, context: GoalContext): GoalDto {
  const base = row.currency
  const zero = Money.zero(base)
  const type = goalType(row.type)

  const target =
    type === 'emergency_fund'
      ? emergencyFundTarget({
          months: row.emergencyMonths ?? 0,
          essentialMonthly: context.essentialMonthly,
        })
      : Money.of(row.targetAmount ?? '0', base).roundToMinor()

  const earmarked = context.earmarkedByGoal.get(row.id) ?? zero
  const spent = context.spentByGoal.get(row.id) ?? zero
  const saved = goalSaved({ earmarked, spent })

  const targetDate = (row.targetDate as PlainDate | null) ?? null
  const monthsLeft = targetDate === null ? null : contributionMonthsLeft(context.period, targetDate)
  const required = requiredMonthly({ target, saved, monthsLeft })

  const planLine = context.planLineByGoal.get(row.id)
  const plannedMonthly = planLine ? Money.of(planLine.plannedAmount, base).roundToMinor() : null

  return {
    id: row.id,
    type,
    name: row.name,
    note: row.note,
    target: target.toDto(),
    targetDate,
    emergencyMonths: (row.emergencyMonths as EmergencyFundMonths | null) ?? null,
    repeat: (row.repeat as GoalRepeat | null) ?? null,
    keptInAccountId: row.keptInAccountId,
    priority: row.priority,
    earmarked: earmarked.toDto(),
    spent: spent.toDto(),
    saved: saved.toDto(),
    remaining: goalRemaining({ target, saved }).toDto(),
    progress: goalProgress({ target, saved })?.toFixed(6) ?? null,
    requiredMonthly: required?.toDto() ?? null,
    monthsLeft,
    plannedMonthly: plannedMonthly?.toDto() ?? null,
    planLineId: planLine?.id ?? null,
    projectedFinish: projectedFinish({ target, saved, monthly: plannedMonthly }, context),
    coverageMonths:
      type === 'emergency_fund'
        ? (emergencyFundCoverage({
            saved,
            essentialMonthly: context.essentialMonthly,
          })?.toFixed(1) ?? null)
        : null,
    status: statusOf({ target, saved, plannedMonthly, requiredMonthly: required }),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  }
}

/**
 * When the goal finishes at its current plan line.
 *
 * Derived rather than promised, and only when there is a line to derive it from: this is what a
 * savings goal with no target date can still say for itself. The month it lands in is counted
 * from this one, so a goal needing one more month finishes this month.
 */
function projectedFinish(
  figures: { target: Money; saved: Money; monthly: Money | null },
  context: GoalContext,
): PlainDate | null {
  if (figures.monthly === null) return null
  const months = monthsToFinish({
    target: figures.target,
    saved: figures.saved,
    monthly: figures.monthly,
  })
  if (months === null || months === 0) return null
  return addMonths(context.period.start, months - 1)
}

function statusOf(figures: {
  target: Money
  saved: Money
  plannedMonthly: Money | null
  requiredMonthly: Money | null
}): GoalStatus {
  return goalStatus({
    target: figures.target,
    saved: figures.saved,
    ...(figures.plannedMonthly === null ? {} : { plannedMonthly: figures.plannedMonthly }),
    requiredMonthly: figures.requiredMonthly,
  })
}

/**
 * The over-earmark warning, per "kept in" account (§9).
 *
 * Built from what has already been loaded rather than from a query of its own, so an account's
 * balance has exactly one definition in the codebase. Only live goals count: an archived goal's
 * earmarks are history, and warning about one the user has put away would be noise.
 */
async function overEarmarkedAccounts(
  db: Db,
  auth: RequestAuth,
  goals: readonly GoalDto[],
): Promise<OverEarmarkedAccountDto[]> {
  const base = auth.workspace.baseCurrency
  const byAccount = new Map<string, Money>()

  for (const goal of goals) {
    if (goal.keptInAccountId === null || goal.archivedAt !== null) continue
    const saved = moneyFromDto(goal.saved)
    if (!saved.isPositive()) continue
    const running = byAccount.get(goal.keptInAccountId) ?? Money.zero(base)
    byAccount.set(goal.keptInAccountId, running.plus(saved))
  }
  if (byAccount.size === 0) return []

  const balances = new Map(
    (await sumBalancesByAccount(db, auth.workspaceId)).map((row) => [row.accountId, row.total]),
  )

  const warnings: OverEarmarkedAccountDto[] = []
  for (const [accountId, earmarked] of byAccount) {
    const balance = balanceFrom(balances.get(accountId), base)
    const excess = overEarmarked({ earmarked, accountBalance: balance })
    if (excess.isZero()) continue
    warnings.push({
      accountId,
      balance: balance.toDto(),
      earmarked: earmarked.toDto(),
      excess: excess.toDto(),
    })
  }
  return warnings
}

function toContributionDto(row: GoalContributionRow): GoalContributionDto {
  return {
    id: row.id,
    goalId: row.goalId,
    date: row.date as PlainDate,
    // NUMERIC(20,4) comes back with its full scale; money leaves the API in minor units.
    amount: Money.of(row.amount, row.currency).roundToMinor().toDto(),
    source: row.source as GoalContributionDto['source'],
    transactionId: row.transactionId,
    periodId: row.periodId,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }
}

/* -------------------------------------------------------------------- reading */

export interface GoalDependencies {
  clock: Clock
}

/** `GET /goals` (PLAN §12). */
export async function listGoals(
  db: Db,
  auth: RequestAuth,
  { clock }: GoalDependencies,
  options: { includeArchived?: boolean } = {},
): Promise<GoalListResponse> {
  const base = auth.workspace.baseCurrency
  const [context, rows] = await Promise.all([
    loadContext(db, auth, clock),
    findGoals(db, auth.workspaceId, options),
  ])

  const goals = rows.map((row) => toGoalDto(row, context))

  return {
    goals,
    totalSaved: Money.sum(
      goals.map((goal) => moneyFromDto(goal.saved)),
      base,
    )
      .roundToMinor()
      .toDto(),
    totalTarget: Money.sum(
      goals.map((goal) => moneyFromDto(goal.target)),
      base,
    )
      .roundToMinor()
      .toDto(),
    essentialMonthly: context.essentialMonthly.toDto(),
    overEarmarked: await overEarmarkedAccounts(db, auth, goals),
  }
}

async function loadGoal(db: Db, auth: RequestAuth, id: string): Promise<GoalRow> {
  const row = await findGoalById(db, auth.workspaceId, id)
  // Another workspace's id is indistinguishable from one that does not exist.
  if (!row) throw notFound('No such goal.')
  return row
}

/** `GET /goals/:id`: the goal and its history of earmarks and releases. */
export async function readGoal(
  db: Db,
  auth: RequestAuth,
  { clock }: GoalDependencies,
  id: string,
): Promise<GoalResponse> {
  const row = await loadGoal(db, auth, id)
  const [context, contributions] = await Promise.all([
    loadContext(db, auth, clock),
    findContributions(db, auth.workspaceId, id),
  ])

  return { goal: toGoalDto(row, context), contributions: contributions.map(toContributionDto) }
}

async function readGoalFor(
  db: Db,
  auth: RequestAuth,
  clock: Clock,
  id: string,
): Promise<GoalResponse> {
  return readGoal(db, auth, { clock }, id)
}

/* -------------------------------------------------------------------- writing */

/**
 * The account a goal says it is kept in: live, this workspace's, and in the base currency.
 *
 * The composite foreign key already makes a foreign account impossible; this is here to answer
 * with a message a person can act on rather than a constraint violation.
 */
async function assertKeptInAccount(db: Db, auth: RequestAuth, accountId: string): Promise<void> {
  const account = await findAccountById(db, auth.workspaceId, accountId)
  if (!account) throw notFound('No such account.')
  if (account.archivedAt) throw conflict('That account is archived.')
  if (account.currency !== auth.workspace.baseCurrency) {
    throw badRequest(`A goal can only be kept in a ${auth.workspace.baseCurrency} account.`)
  }
}

function assertBaseCurrency(amount: Money, auth: RequestAuth): void {
  if (amount.currency !== auth.workspace.baseCurrency) {
    throw badRequest(`Amounts must be in ${auth.workspace.baseCurrency}.`)
  }
}

/** `POST /goals` (flow F7). Idempotent on a client-supplied id (§12). */
export async function createGoal(
  db: Db,
  auth: RequestAuth,
  { clock }: GoalDependencies,
  input: CreateGoalInput,
): Promise<{ goal: GoalDto; created: boolean }> {
  assertCanWrite(auth)

  const base = auth.workspace.baseCurrency
  const id = input.id ?? uuidv7()

  const existing = await findGoalById(db, auth.workspaceId, id)
  if (existing) {
    return { goal: toGoalDto(existing, await loadContext(db, auth, clock)), created: false }
  }

  if (input.keptInAccountId) await assertKeptInAccount(db, auth, input.keptInAccountId)

  // An emergency fund's target is derived, so it stores none; the other two carry what was typed.
  const target = input.type === 'emergency_fund' ? null : moneyFromDto(input.target)
  if (target) assertBaseCurrency(target, auth)

  const inserted = await insertGoal(db, {
    id,
    workspaceId: auth.workspaceId,
    type: input.type,
    name: input.name,
    note: input.note?.trim() ? input.note.trim() : null,
    targetAmount: target ? target.roundToMinor().toDto().amount : null,
    currency: base,
    targetDate: input.type === 'emergency_fund' ? null : (input.targetDate ?? null),
    emergencyMonths: input.type === 'emergency_fund' ? input.emergencyMonths : null,
    repeat: input.type === 'sinking_fund' ? (input.repeat ?? null) : null,
    keptInAccountId: input.keptInAccountId ?? null,
    priority: input.priority ?? 0,
  })
  if (!inserted) throw conflict('That goal could not be created. Try again.')

  return { goal: toGoalDto(inserted, await loadContext(db, auth, clock)), created: true }
}

/**
 * `PATCH /goals/:id`.
 *
 * The type never changes: an emergency fund keeps its target in months of cover and the other two
 * in an amount, so turning one into the other is a new goal rather than an edit. The fields that
 * belong to another type are refused here with a message, which the check constraints then
 * guarantee can never be written by any other route.
 */
export async function patchGoal(
  db: Db,
  auth: RequestAuth,
  { clock }: GoalDependencies,
  id: string,
  input: UpdateGoalInput,
): Promise<GoalDto> {
  assertCanWrite(auth)

  const row = await loadGoal(db, auth, id)
  const type = goalType(row.type)

  if (input.emergencyMonths !== undefined && type !== 'emergency_fund') {
    throw badRequest('Months of cover belong to an emergency fund.')
  }
  if (input.target !== undefined && type === 'emergency_fund') {
    throw badRequest(
      "An emergency fund's target comes from your plan's essentials. Change its months of cover instead.",
    )
  }
  if (input.repeat !== undefined && input.repeat !== null && type !== 'sinking_fund') {
    throw badRequest('Only a sinking fund repeats.')
  }
  if (input.targetDate === null && type === 'sinking_fund') {
    throw badRequest('A sinking fund needs the date its bill falls due.')
  }
  if (input.targetDate !== undefined && input.targetDate !== null && type === 'emergency_fund') {
    throw badRequest('An emergency fund has no target date.')
  }
  if (input.keptInAccountId) await assertKeptInAccount(db, auth, input.keptInAccountId)

  const target = input.target === undefined ? undefined : moneyFromDto(input.target)
  if (target) assertBaseCurrency(target, auth)

  const updated = await updateGoal(db, auth.workspaceId, id, {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.note === undefined ? {} : { note: input.note?.trim() || null }),
    ...(target === undefined ? {} : { targetAmount: target.roundToMinor().toDto().amount }),
    ...(input.targetDate === undefined ? {} : { targetDate: input.targetDate }),
    ...(input.emergencyMonths === undefined ? {} : { emergencyMonths: input.emergencyMonths }),
    ...(input.repeat === undefined ? {} : { repeat: input.repeat }),
    ...(input.keptInAccountId === undefined ? {} : { keptInAccountId: input.keptInAccountId }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  })
  if (!updated) throw notFound('No such goal.')

  return toGoalDto(updated, await loadContext(db, auth, clock))
}

/**
 * Archives a goal, or brings it back (§7: goals with history are archived, never deleted).
 *
 * Its contributions stay exactly as they are — they are what happened — but an archived goal's
 * earmarks stop counting against the account they are kept in, because the user has put the goal
 * away and a standing warning about it would be noise. A plan line pointing at it is left alone:
 * clearing an allocation is its own decision, and the plan drops the row once the line is gone.
 */
export async function setGoalArchived(
  db: Db,
  auth: RequestAuth,
  { clock }: GoalDependencies,
  id: string,
  archived: boolean,
): Promise<GoalDto> {
  assertCanWrite(auth)
  await loadGoal(db, auth, id)

  const updated = await updateGoal(db, auth.workspaceId, id, {
    archivedAt: archived ? new Date() : null,
  })
  if (!updated) throw notFound('No such goal.')

  return toGoalDto(updated, await loadContext(db, auth, clock))
}

const CONTRIBUTION_MESSAGES: Record<string, string> = {
  notPositive: 'A contribution cannot be zero.',
  moreThanSaved: 'That is more than this goal holds. Release only what is in it.',
  goalArchived: 'That goal is archived. Bring it back before contributing to it.',
}

/**
 * Records a contribution: an earmark, or a release (flow F8).
 *
 * Nothing moves between accounts. A contribution is a statement about money the user already has
 * — which is exactly why the MVP's goals work without the funding-source machinery that combined
 * goals need in v2 (§9).
 *
 * A `transactionId` links an existing transfer to the goal, §9's fourth funding route, and the
 * source is recorded as `transfer` rather than `manual` so the goal's history says where it came
 * from.
 */
export async function contribute(
  db: Db,
  auth: RequestAuth,
  { clock }: GoalDependencies,
  goalId: string,
  input: CreateContributionInput,
): Promise<GoalResponse> {
  assertCanWrite(auth)

  const row = await loadGoal(db, auth, goalId)
  const amount = moneyFromDto(input.amount)
  assertBaseCurrency(amount, auth)

  const id = input.id ?? uuidv7()
  const existing = await findContributionById(db, auth.workspaceId, id)
  if (existing) return readGoalFor(db, auth, clock, goalId)

  if (input.transactionId) {
    const transaction = await findTransactionById(db, auth.workspaceId, input.transactionId)
    if (!transaction || transaction.deletedAt) throw notFound('No such transaction.')
  }

  const context = await loadContext(db, auth, clock)
  const saved = goalSaved({
    earmarked: context.earmarkedByGoal.get(goalId) ?? Money.zero(row.currency),
    spent: context.spentByGoal.get(goalId) ?? Money.zero(row.currency),
  })

  const check = checkContribution({ amount, saved, archived: row.archivedAt !== null })
  if (!check.ok) {
    throw conflict(CONTRIBUTION_MESSAGES[check.refusal] ?? 'That contribution is not possible.')
  }

  const date = input.date ?? context.today
  /*
   * The period the contribution counted in, when that month has been planned. It is provenance
   * only — a goal line sums contributions by their own date (§10), so a back-dated earmark lands
   * in the month the money belongs to whether or not a period row exists for it.
   */
  const period = periodContaining(date, auth.workspace.periodStartDay)
  const periodRow = await findPeriodByStart(db, auth.workspaceId, period.start)

  await insertContribution(db, {
    id,
    workspaceId: auth.workspaceId,
    goalId,
    date,
    amount: amount.roundToMinor().toDto().amount,
    currency: row.currency,
    source: input.transactionId ? 'transfer' : 'manual',
    transactionId: input.transactionId ?? null,
    periodId: periodRow?.id ?? null,
    note: input.note?.trim() ? input.note.trim() : null,
  })

  return readGoalFor(db, auth, clock, goalId)
}

/** Undoes a contribution. The money goes back to being unearmarked, and nothing else moves. */
export async function removeContribution(
  db: Db,
  auth: RequestAuth,
  { clock }: GoalDependencies,
  goalId: string,
  id: string,
): Promise<GoalResponse> {
  assertCanWrite(auth)
  await loadGoal(db, auth, goalId)

  const contribution = await findContributionById(db, auth.workspaceId, id)
  if (!contribution || contribution.goalId !== goalId) throw notFound('No such contribution.')

  await deleteContribution(db, auth.workspaceId, id)
  return readGoalFor(db, auth, clock, goalId)
}

/**
 * "Add to plan" (§9): gives the goal an allocation in the month being planned.
 *
 * The amount defaults to what the goal needs each month, which is the point of the button — the
 * user has just been told they need ₺3,000 a month and should not have to type it again. The
 * write goes through the plan's own upsert, so a goal line is created, versioned and checked
 * exactly like every other allocation.
 */
export async function addGoalToPlan(
  db: Db,
  auth: RequestAuth,
  { clock }: GoalDependencies,
  id: string,
  input: AddGoalToPlanInput,
): Promise<GoalResponse> {
  assertCanWrite(auth)

  const row = await loadGoal(db, auth, id)
  if (row.archivedAt) throw conflict('That goal is archived.')

  const context = await loadContext(db, auth, clock)
  const goal = toGoalDto(row, context)

  const planned = input.planned ?? goal.requiredMonthly
  if (!planned) {
    throw badRequest(
      'This goal has no target date, so there is no monthly amount to suggest. Enter one to add it to the plan.',
    )
  }
  assertBaseCurrency(moneyFromDto(planned), auth)

  await upsertPlanLine(db, auth, { clock }, input.start, { target: 'goal', goalId: id, planned })

  return readGoalFor(db, auth, clock, id)
}
