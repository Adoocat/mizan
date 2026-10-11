import type { PlainDate } from '@mizan/domain'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import {
  accounts,
  categories,
  categoryGroups,
  goalContributions,
  goals,
  planLines,
  transactionLines,
  transactions,
} from '../../db/schema/index.ts'
import type { Executor } from '../ledger/repository.ts'

/*
 * Every query here is scoped by `workspace_id` (CLAUDE.md, PLAN §15), and NUMERIC columns come
 * back as strings and stay strings until the service hands them to the domain.
 */

export interface GoalRow {
  id: string
  type: string
  name: string
  note: string | null
  targetAmount: string | null
  currency: string
  targetDate: string | null
  emergencyMonths: number | null
  repeat: string | null
  keptInAccountId: string | null
  priority: number
  archivedAt: Date | null
}

export interface GoalContributionRow {
  id: string
  goalId: string
  date: string
  amount: string
  currency: string
  source: string
  transactionId: string | null
  periodId: string | null
  note: string | null
  createdAt: Date
}

const goalColumns = {
  id: goals.id,
  type: goals.type,
  name: goals.name,
  note: goals.note,
  targetAmount: goals.targetAmount,
  currency: goals.currency,
  targetDate: goals.targetDate,
  emergencyMonths: goals.emergencyMonths,
  repeat: goals.repeat,
  keptInAccountId: goals.keptInAccountId,
  priority: goals.priority,
  archivedAt: goals.archivedAt,
} as const

const contributionColumns = {
  id: goalContributions.id,
  goalId: goalContributions.goalId,
  date: goalContributions.date,
  amount: goalContributions.amount,
  currency: goalContributions.currency,
  source: goalContributions.source,
  transactionId: goalContributions.transactionId,
  periodId: goalContributions.periodId,
  note: goalContributions.note,
  createdAt: goalContributions.createdAt,
} as const

/* -------------------------------------------------------------------- goals */

export async function findGoals(
  tx: Executor,
  workspaceId: string,
  options: { includeArchived?: boolean } = {},
): Promise<GoalRow[]> {
  return tx
    .select(goalColumns)
    .from(goals)
    .where(
      and(
        eq(goals.workspaceId, workspaceId),
        ...(options.includeArchived ? [] : [isNull(goals.archivedAt)]),
      ),
    )
    .orderBy(asc(goals.priority), asc(goals.name), asc(goals.id))
}

export async function findGoalById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<GoalRow | undefined> {
  const [row] = await tx
    .select(goalColumns)
    .from(goals)
    .where(and(eq(goals.workspaceId, workspaceId), eq(goals.id, id)))
    .limit(1)
  return row
}

export interface InsertGoalInput {
  id: string
  workspaceId: string
  type: string
  name: string
  note: string | null
  targetAmount: string | null
  currency: string
  targetDate: PlainDate | null
  emergencyMonths: number | null
  repeat: string | null
  keptInAccountId: string | null
  priority: number
}

export async function insertGoal(
  tx: Executor,
  input: InsertGoalInput,
): Promise<GoalRow | undefined> {
  const [row] = await tx.insert(goals).values(input).returning(goalColumns)
  return row
}

export interface UpdateGoalPatch {
  name?: string
  note?: string | null
  targetAmount?: string | null
  targetDate?: PlainDate | null
  emergencyMonths?: number | null
  repeat?: string | null
  keptInAccountId?: string | null
  priority?: number
  archivedAt?: Date | null
}

export async function updateGoal(
  tx: Executor,
  workspaceId: string,
  id: string,
  patch: UpdateGoalPatch,
): Promise<GoalRow | undefined> {
  const [row] = await tx
    .update(goals)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(goals.workspaceId, workspaceId), eq(goals.id, id)))
    .returning(goalColumns)
  return row
}

/* ------------------------------------------------------------ contributions */

export async function findContributions(
  tx: Executor,
  workspaceId: string,
  goalId: string,
): Promise<GoalContributionRow[]> {
  return tx
    .select(contributionColumns)
    .from(goalContributions)
    .where(
      and(eq(goalContributions.workspaceId, workspaceId), eq(goalContributions.goalId, goalId)),
    )
    .orderBy(desc(goalContributions.date), desc(goalContributions.id))
}

export async function findContributionById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<GoalContributionRow | undefined> {
  const [row] = await tx
    .select(contributionColumns)
    .from(goalContributions)
    .where(and(eq(goalContributions.workspaceId, workspaceId), eq(goalContributions.id, id)))
    .limit(1)
  return row
}

export interface InsertContributionInput {
  id: string
  workspaceId: string
  goalId: string
  date: PlainDate
  amount: string
  currency: string
  source: string
  transactionId: string | null
  periodId: string | null
  note: string | null
}

export async function insertContribution(
  tx: Executor,
  input: InsertContributionInput,
): Promise<GoalContributionRow | undefined> {
  const [row] = await tx.insert(goalContributions).values(input).returning(contributionColumns)
  return row
}

export async function deleteContribution(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<GoalContributionRow | undefined> {
  const [row] = await tx
    .delete(goalContributions)
    .where(and(eq(goalContributions.workspaceId, workspaceId), eq(goalContributions.id, id)))
    .returning(contributionColumns)
  return row
}

/* ----------------------------------------------------------------- the sums */

export interface GoalTotalRow {
  goalId: string
  /** The **signed** sum: earmarks positive, releases negative. The domain decides what it means. */
  total: string
}

/**
 * What every goal has earmarked, all time (§9).
 *
 * One row per goal that has any contribution at all; the service treats a goal that is absent as
 * zero, which is also the right answer for a goal created a moment ago.
 */
export async function sumContributionsByGoal(
  tx: Executor,
  workspaceId: string,
): Promise<GoalTotalRow[]> {
  return tx
    .select({
      goalId: goalContributions.goalId,
      total: sql<string>`sum(${goalContributions.amount})`,
    })
    .from(goalContributions)
    .where(eq(goalContributions.workspaceId, workspaceId))
    .groupBy(goalContributions.goalId)
}

export interface GoalPeriodTotalRow extends GoalTotalRow {
  /**
   * The same sum over everything dated **before today**, which is what the daily allowance
   * divides (§10). One query returns both, so the two figures can never be read from different
   * states of the data.
   */
  totalBeforeToday: string
}

/**
 * Contributions to each goal dated inside a period — a goal plan line's `actual` (§10).
 *
 * Dates are matched on the contribution's own business date rather than on `period_id`, so a
 * contribution back-dated into a month it was not recorded in still counts where the money
 * belongs. `period_id` stays on the row as provenance for the close (phase 10).
 */
export async function sumContributionsByGoalForPeriod(
  tx: Executor,
  workspaceId: string,
  period: { start: PlainDate; end: PlainDate },
  today: PlainDate,
): Promise<GoalPeriodTotalRow[]> {
  return tx
    .select({
      goalId: goalContributions.goalId,
      total: sql<string>`sum(${goalContributions.amount})`,
      totalBeforeToday: sql<string>`sum(
        CASE WHEN ${goalContributions.date} < ${today} THEN ${goalContributions.amount} ELSE 0 END
      )`,
    })
    .from(goalContributions)
    .where(
      and(
        eq(goalContributions.workspaceId, workspaceId),
        sql`${goalContributions.date} >= ${period.start}`,
        sql`${goalContributions.date} < ${period.end}`,
      ),
    )
    .groupBy(goalContributions.goalId)
}

/**
 * What has been spent straight out of each goal: the goal-funded expense lines (§9).
 *
 * The signed ledger sum, so money leaving a goal arrives here negative and the domain reads it as
 * spending. Deriving this from the ledger rather than storing a matching contribution is what
 * keeps the two from drifting: correcting the expense, or undeleting it, moves the goal with it.
 *
 * Deleted transactions are excluded, which is what makes undo restore the goal's balance too.
 */
export async function sumGoalFundedSpendByGoal(
  tx: Executor,
  workspaceId: string,
): Promise<GoalTotalRow[]> {
  return tx
    .select({
      goalId: sql<string>`${transactionLines.goalId}`,
      total: sql<string>`sum(${transactionLines.amount})`,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
    .where(
      and(
        eq(transactionLines.workspaceId, workspaceId),
        isNotNull(transactionLines.goalId),
        isNull(transactions.deletedAt),
      ),
    )
    .groupBy(transactionLines.goalId)
}

/*
 * The over-earmark warning (§9) needs no query of its own: the service already holds every live
 * goal with its `kept_in_account_id` and the two sums above, and the ledger's
 * `sumBalancesByAccount` already answers what each account holds. Grouping those in the service
 * keeps one definition of an account's balance in the codebase instead of two.
 */

/* ------------------------------------------------- what an emergency fund needs */

/**
 * One month of essential spending as the **plan** states it: `Σ planned` over the period's
 * essential and debt lines (§9).
 *
 * This is what an emergency fund's target is built from, recomputed on every read, which is why
 * the fund stores no target of its own: raise the rent line and the fund you need grows with it.
 *
 * Debt counts as essential here — a loan installment does not pause when an income does — and
 * carry-in does not: it is last month's leftover, not a monthly cost.
 */
export async function sumEssentialAllocations(
  tx: Executor,
  workspaceId: string,
  periodId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ total: sql<string | null>`sum(${planLines.plannedAmount})` })
    .from(planLines)
    .innerJoin(
      categories,
      and(
        eq(categories.id, planLines.categoryId),
        eq(categories.workspaceId, planLines.workspaceId),
      ),
    )
    .innerJoin(
      categoryGroups,
      and(
        eq(categoryGroups.id, categories.groupId),
        eq(categoryGroups.workspaceId, categories.workspaceId),
      ),
    )
    .where(
      and(
        eq(planLines.workspaceId, workspaceId),
        eq(planLines.periodId, periodId),
        sql`${categoryGroups.kind} IN ('essential', 'debt')`,
      ),
    )
  return row?.total ?? null
}

/**
 * What was actually spent on essentials and debt over a date range: the "3-month actual average"
 * §9 shows beside the planned figure, so a plan that understates the real cost of living is
 * visible rather than quietly shrinking the emergency fund's target.
 *
 * The signed ledger sum, read as money that left. Goal-funded lines are excluded for the same
 * reason the plan excludes them.
 */
export async function sumEssentialSpending(
  tx: Executor,
  workspaceId: string,
  range: { start: PlainDate; end: PlainDate },
): Promise<string | null> {
  const [row] = await tx
    .select({ total: sql<string | null>`sum(${transactionLines.amount})` })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
    .innerJoin(
      accounts,
      and(eq(accounts.id, transactionLines.accountId), eq(accounts.workspaceId, workspaceId)),
    )
    .innerJoin(
      categories,
      and(
        eq(categories.id, transactionLines.categoryId),
        eq(categories.workspaceId, transactionLines.workspaceId),
      ),
    )
    .innerJoin(
      categoryGroups,
      and(
        eq(categoryGroups.id, categories.groupId),
        eq(categoryGroups.workspaceId, categories.workspaceId),
      ),
    )
    .where(
      and(
        eq(transactionLines.workspaceId, workspaceId),
        isNull(transactions.deletedAt),
        isNull(transactionLines.goalId),
        eq(accounts.onBudget, true),
        sql`${categoryGroups.kind} IN ('essential', 'debt')`,
        sql`${transactions.type} IN ('expense', 'income', 'transfer')`,
        sql`${transactionLines.date} >= ${range.start}`,
        sql`${transactionLines.date} < ${range.end}`,
      ),
    )
  return row?.total ?? null
}

/* --------------------------------------------------------- goals in the plan */

export interface GoalPlanLineRow {
  id: string
  goalId: string
  plannedAmount: string
  carryIn: string
  rollover: boolean
  version: number
}

/** The plan lines that point at a goal in one period: "add to plan" and what it allocated. */
export async function findGoalPlanLines(
  tx: Executor,
  workspaceId: string,
  periodId: string,
): Promise<GoalPlanLineRow[]> {
  const rows = await tx
    .select({
      id: planLines.id,
      goalId: sql<string>`${planLines.goalId}`,
      plannedAmount: planLines.plannedAmount,
      carryIn: planLines.carryIn,
      rollover: planLines.rollover,
      version: planLines.version,
    })
    .from(planLines)
    .where(
      and(
        eq(planLines.workspaceId, workspaceId),
        eq(planLines.periodId, periodId),
        isNotNull(planLines.goalId),
      ),
    )
  return rows
}

/** Whether any plan line still points at this goal, which is what stops it being deleted. */
export async function countPlanLinesForGoal(
  tx: Executor,
  workspaceId: string,
  goalId: string,
): Promise<number> {
  const [row] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(planLines)
    .where(and(eq(planLines.workspaceId, workspaceId), eq(planLines.goalId, goalId)))
  return Number.parseInt(row?.count ?? '0', 10)
}
