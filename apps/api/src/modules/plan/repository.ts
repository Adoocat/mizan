import type { PlainDate } from '@mizan/domain'
import { and, asc, desc, eq, exists, isNull, lt, or, sql } from 'drizzle-orm'
import {
  accounts,
  planIncomeItems,
  planLines,
  planMoves,
  planPeriods,
  transactionLines,
  transactions,
} from '../../db/schema/index.ts'
import type { Executor } from '../ledger/repository.ts'

/*
 * Every query here is scoped by `workspace_id` (CLAUDE.md, PLAN §15), and NUMERIC columns come
 * back as strings and stay strings until the service hands them to the domain.
 */

export interface PlanPeriodRow {
  id: string
  startDate: string
  endDate: string
  status: string
  closedAt: Date | null
}

export interface PlanLineRow {
  id: string
  periodId: string
  categoryId: string | null
  isPool: boolean
  plannedAmount: string
  carryIn: string
  rollover: boolean
  sortOrder: number
  version: number
}

export interface PlanIncomeItemRow {
  id: string
  periodId: string
  categoryId: string
  label: string | null
  expectedAmount: string
  expectedDate: string | null
  receivedAmount: string | null
  receivedAt: Date | null
  sortOrder: number
}

const periodColumns = {
  id: planPeriods.id,
  startDate: planPeriods.startDate,
  endDate: planPeriods.endDate,
  status: planPeriods.status,
  closedAt: planPeriods.closedAt,
} as const

const lineColumns = {
  id: planLines.id,
  periodId: planLines.periodId,
  categoryId: planLines.categoryId,
  isPool: planLines.isPool,
  plannedAmount: planLines.plannedAmount,
  carryIn: planLines.carryIn,
  rollover: planLines.rollover,
  sortOrder: planLines.sortOrder,
  version: planLines.version,
} as const

const incomeItemColumns = {
  id: planIncomeItems.id,
  periodId: planIncomeItems.periodId,
  categoryId: planIncomeItems.categoryId,
  label: planIncomeItems.label,
  expectedAmount: planIncomeItems.expectedAmount,
  expectedDate: planIncomeItems.expectedDate,
  receivedAmount: planIncomeItems.receivedAmount,
  receivedAt: planIncomeItems.receivedAt,
  sortOrder: planIncomeItems.sortOrder,
} as const

/* ------------------------------------------------------------------ periods */

export async function findPeriodByStart(
  tx: Executor,
  workspaceId: string,
  start: PlainDate,
): Promise<PlanPeriodRow | undefined> {
  const [row] = await tx
    .select(periodColumns)
    .from(planPeriods)
    .where(and(eq(planPeriods.workspaceId, workspaceId), eq(planPeriods.startDate, start)))
    .limit(1)
  return row
}

/**
 * The most recent planned period before `start`: what "copy last month" copies from.
 *
 * It has to have at least one line, or the copy would produce an empty plan and the button would
 * be offering nothing. Periods that only hold income items are skipped for the same reason.
 */
export async function findLatestPlannedPeriodBefore(
  tx: Executor,
  workspaceId: string,
  start: PlainDate,
): Promise<PlanPeriodRow | undefined> {
  const [row] = await tx
    .select(periodColumns)
    .from(planPeriods)
    .where(
      and(
        eq(planPeriods.workspaceId, workspaceId),
        lt(planPeriods.startDate, start),
        exists(
          tx
            .select({ one: sql`1` })
            .from(planLines)
            .where(
              and(eq(planLines.workspaceId, workspaceId), eq(planLines.periodId, planPeriods.id)),
            ),
        ),
      ),
    )
    .orderBy(desc(planPeriods.startDate))
    .limit(1)
  return row
}

export interface InsertPeriodInput {
  id: string
  workspaceId: string
  startDate: PlainDate
  endDate: PlainDate
}

/**
 * Writes the period row. Two requests can race here — the first edit of a month and the first
 * income item, say — so a conflict on `plan_periods_workspace_start_key` means the other one won
 * and its row is the answer.
 */
export async function insertPeriod(
  tx: Executor,
  input: InsertPeriodInput,
): Promise<PlanPeriodRow | undefined> {
  const [row] = await tx
    .insert(planPeriods)
    .values(input)
    .onConflictDoNothing({ target: [planPeriods.workspaceId, planPeriods.startDate] })
    .returning(periodColumns)
  return row
}

/* -------------------------------------------------------------------- lines */

export async function findLines(
  tx: Executor,
  workspaceId: string,
  periodId: string,
): Promise<PlanLineRow[]> {
  return tx
    .select(lineColumns)
    .from(planLines)
    .where(and(eq(planLines.workspaceId, workspaceId), eq(planLines.periodId, periodId)))
    .orderBy(asc(planLines.sortOrder), asc(planLines.id))
}

export async function findLineById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<PlanLineRow | undefined> {
  const [row] = await tx
    .select(lineColumns)
    .from(planLines)
    .where(and(eq(planLines.workspaceId, workspaceId), eq(planLines.id, id)))
    .limit(1)
  return row
}

/** The line a target already has in this period, if any: what makes an edit an upsert. */
export async function findLineByTarget(
  tx: Executor,
  workspaceId: string,
  periodId: string,
  target: { categoryId: string | null },
): Promise<PlanLineRow | undefined> {
  const [row] = await tx
    .select(lineColumns)
    .from(planLines)
    .where(
      and(
        eq(planLines.workspaceId, workspaceId),
        eq(planLines.periodId, periodId),
        target.categoryId === null
          ? isNull(planLines.categoryId)
          : eq(planLines.categoryId, target.categoryId),
      ),
    )
    .limit(1)
  return row
}

export interface InsertLineInput {
  id: string
  workspaceId: string
  periodId: string
  categoryId: string | null
  isPool: boolean
  plannedAmount: string
  rollover: boolean
  sortOrder: number
}

export async function insertLine(
  tx: Executor,
  input: InsertLineInput,
): Promise<PlanLineRow | undefined> {
  const [row] = await tx.insert(planLines).values(input).returning(lineColumns)
  return row
}

export interface UpdateLinePatch {
  plannedAmount?: string
  rollover?: boolean
  carryIn?: string
}

/**
 * Edits a line and bumps its version. `expectedVersion` makes the write conditional: with two
 * tabs open on the same month, the second one is told its amount is stale rather than silently
 * overwriting the first.
 */
export async function updateLine(
  tx: Executor,
  workspaceId: string,
  id: string,
  patch: UpdateLinePatch,
  expectedVersion?: number,
): Promise<PlanLineRow | undefined> {
  const [row] = await tx
    .update(planLines)
    .set({ ...patch, version: sql`${planLines.version} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(planLines.workspaceId, workspaceId),
        eq(planLines.id, id),
        ...(expectedVersion === undefined ? [] : [eq(planLines.version, expectedVersion)]),
      ),
    )
    .returning(lineColumns)
  return row
}

export async function deleteLine(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<PlanLineRow | undefined> {
  const [row] = await tx
    .delete(planLines)
    .where(and(eq(planLines.workspaceId, workspaceId), eq(planLines.id, id)))
    .returning(lineColumns)
  return row
}

/* ------------------------------------------------------------- income items */

export async function findIncomeItems(
  tx: Executor,
  workspaceId: string,
  periodId: string,
): Promise<PlanIncomeItemRow[]> {
  return tx
    .select(incomeItemColumns)
    .from(planIncomeItems)
    .where(
      and(eq(planIncomeItems.workspaceId, workspaceId), eq(planIncomeItems.periodId, periodId)),
    )
    .orderBy(asc(planIncomeItems.sortOrder), asc(planIncomeItems.id))
}

export async function findIncomeItemById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<PlanIncomeItemRow | undefined> {
  const [row] = await tx
    .select(incomeItemColumns)
    .from(planIncomeItems)
    .where(and(eq(planIncomeItems.workspaceId, workspaceId), eq(planIncomeItems.id, id)))
    .limit(1)
  return row
}

export interface InsertIncomeItemInput {
  id: string
  workspaceId: string
  periodId: string
  categoryId: string
  label: string | null
  expectedAmount: string
  expectedDate: PlainDate | null
  receivedAmount?: string | null
  receivedAt?: Date | null
  sortOrder: number
}

export async function insertIncomeItem(
  tx: Executor,
  input: InsertIncomeItemInput,
): Promise<PlanIncomeItemRow | undefined> {
  const [row] = await tx.insert(planIncomeItems).values(input).returning(incomeItemColumns)
  return row
}

export interface UpdateIncomeItemPatch {
  categoryId?: string
  label?: string | null
  expectedAmount?: string
  expectedDate?: PlainDate | null
  receivedAmount?: string | null
  receivedAt?: Date | null
}

export async function updateIncomeItem(
  tx: Executor,
  workspaceId: string,
  id: string,
  patch: UpdateIncomeItemPatch,
): Promise<PlanIncomeItemRow | undefined> {
  const [row] = await tx
    .update(planIncomeItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(planIncomeItems.workspaceId, workspaceId), eq(planIncomeItems.id, id)))
    .returning(incomeItemColumns)
  return row
}

export async function deleteIncomeItem(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<PlanIncomeItemRow | undefined> {
  const [row] = await tx
    .delete(planIncomeItems)
    .where(and(eq(planIncomeItems.workspaceId, workspaceId), eq(planIncomeItems.id, id)))
    .returning(incomeItemColumns)
  return row
}

export async function nextIncomeItemSortOrder(
  tx: Executor,
  workspaceId: string,
  periodId: string,
): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${planIncomeItems.sortOrder})` })
    .from(planIncomeItems)
    .where(
      and(eq(planIncomeItems.workspaceId, workspaceId), eq(planIncomeItems.periodId, periodId)),
    )
  return (row?.max ?? 0) + 1
}

/* ------------------------------------------------------------------ actuals */

export interface CategoryActualRow {
  /** Null for on-budget spending that was never categorized, which the pool answers for. */
  categoryId: string | null
  /** The **signed** sum: negative is money that left. The domain decides what that means. */
  total: string
  /**
   * The same sum over everything dated **before today**, which is what the daily allowance
   * divides (§10: "safe to spend today = ATS excluding today's spending ÷ days left"). One query
   * returns both, so the two figures can never be read from different states of the ledger.
   */
  totalBeforeToday: string
}

/**
 * What actually happened in a period, per category (PLAN §10, §16).
 *
 * SQL aggregates and the domain applies the rules, so this is deliberately one plain signed sum
 * per category. The service negates it for spending categories and takes it as it stands for
 * income ones, which is also what makes a refund — recorded as income in the same category —
 * reduce the spending rather than inflate it.
 *
 * What is counted:
 * - only lines on **on-budget** accounts, because off-budget money is outside the plan;
 * - only `expense`, `income` and `transfer` transactions. An opening balance is not spending and
 *   a reconciliation is a correction, so neither belongs in a plan line. A transfer that stays
 *   inside the budget carries no category and its two legs cancel; one that leaves the budget
 *   carries a category on the on-budget leg, which is exactly the spending the plan should see.
 * - dates in `[start, end)`, taken from the denormalized date on the line.
 */
export async function sumActualByCategory(
  tx: Executor,
  workspaceId: string,
  period: { start: PlainDate; end: PlainDate },
  today: PlainDate,
): Promise<CategoryActualRow[]> {
  return tx
    .select({
      categoryId: transactionLines.categoryId,
      total: sql<string>`sum(${transactionLines.amount})`,
      totalBeforeToday: sql<string>`sum(
        CASE WHEN ${transactionLines.date} < ${today} THEN ${transactionLines.amount} ELSE 0 END
      )`,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
    .innerJoin(
      accounts,
      and(eq(accounts.id, transactionLines.accountId), eq(accounts.workspaceId, workspaceId)),
    )
    .where(
      and(
        eq(transactionLines.workspaceId, workspaceId),
        isNull(transactions.deletedAt),
        eq(accounts.onBudget, true),
        sql`${transactions.type} IN ('expense', 'income', 'transfer')`,
        sql`${transactionLines.date} >= ${period.start}`,
        sql`${transactionLines.date} < ${period.end}`,
      ),
    )
    .groupBy(transactionLines.categoryId)
}

/* -------------------------------------------------------------------- moves */

export interface PlanMoveRow {
  id: string
  fromLineId: string
  toLineId: string
  amount: string
  reason: string | null
  createdAt: Date
}

const moveColumns = {
  id: planMoves.id,
  fromLineId: planMoves.fromLineId,
  toLineId: planMoves.toLineId,
  amount: planMoves.amount,
  reason: planMoves.reason,
  createdAt: planMoves.createdAt,
} as const

export async function findMoves(
  tx: Executor,
  workspaceId: string,
  periodId: string,
): Promise<PlanMoveRow[]> {
  return tx
    .select(moveColumns)
    .from(planMoves)
    .where(and(eq(planMoves.workspaceId, workspaceId), eq(planMoves.periodId, periodId)))
    .orderBy(asc(planMoves.createdAt), asc(planMoves.id))
}

export async function findMoveById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<PlanMoveRow | undefined> {
  const [row] = await tx
    .select(moveColumns)
    .from(planMoves)
    .where(and(eq(planMoves.workspaceId, workspaceId), eq(planMoves.id, id)))
    .limit(1)
  return row
}

export interface InsertMoveInput {
  id: string
  workspaceId: string
  periodId: string
  fromLineId: string
  toLineId: string
  amount: string
  reason: string | null
}

export async function insertMove(
  tx: Executor,
  input: InsertMoveInput,
): Promise<PlanMoveRow | undefined> {
  const [row] = await tx.insert(planMoves).values(input).returning(moveColumns)
  return row
}

export async function deleteMove(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<PlanMoveRow | undefined> {
  const [row] = await tx
    .delete(planMoves)
    .where(and(eq(planMoves.workspaceId, workspaceId), eq(planMoves.id, id)))
    .returning(moveColumns)
  return row
}

/** Whether any cover still points at this line, which is what stops it being deleted (§10). */
export async function countMovesForLine(
  tx: Executor,
  workspaceId: string,
  lineId: string,
): Promise<number> {
  const [row] = await tx
    .select({ count: sql<string>`count(*)` })
    .from(planMoves)
    .where(
      and(
        eq(planMoves.workspaceId, workspaceId),
        or(eq(planMoves.fromLineId, lineId), eq(planMoves.toLineId, lineId)),
      ),
    )
  return Number.parseInt(row?.count ?? '0', 10)
}
