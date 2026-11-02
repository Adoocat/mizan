import type { PlainDate } from '@mizan/domain'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  recurrenceExceptions,
  recurringRules,
  transactions,
  workspaces,
} from '../../db/schema/index.ts'
import type { Executor } from '../ledger/repository.ts'

/*
 * Every query here is scoped by `workspace_id` (CLAUDE.md, PLAN §15) except the two the auto-post
 * worker uses, which run across workspaces by design and are marked as such. NUMERIC columns come
 * back as strings and stay strings until the service hands them to the domain.
 */

export interface RecurringRuleRow {
  id: string
  seriesId: string
  name: string
  kind: string
  payee: string | null
  notes: string | null
  amount: string
  currency: string
  amountMode: string
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  goalId: string | null
  freq: string
  interval: number
  startDate: string
  byMonthDay: number | null
  weekendPolicy: string
  endDate: string | null
  maxCount: number | null
  status: string
  pausedFrom: string | null
  pausedUntil: string | null
  autoPost: boolean
  createdBy: string | null
  createdAt: Date
}

const ruleColumns = {
  id: recurringRules.id,
  seriesId: recurringRules.seriesId,
  name: recurringRules.name,
  kind: recurringRules.kind,
  payee: recurringRules.payee,
  notes: recurringRules.notes,
  amount: recurringRules.amount,
  currency: recurringRules.currency,
  amountMode: recurringRules.amountMode,
  accountId: recurringRules.accountId,
  toAccountId: recurringRules.toAccountId,
  categoryId: recurringRules.categoryId,
  goalId: recurringRules.goalId,
  freq: recurringRules.freq,
  interval: recurringRules.interval,
  startDate: recurringRules.startDate,
  byMonthDay: recurringRules.byMonthDay,
  weekendPolicy: recurringRules.weekendPolicy,
  endDate: recurringRules.endDate,
  maxCount: recurringRules.maxCount,
  status: recurringRules.status,
  pausedFrom: recurringRules.pausedFrom,
  pausedUntil: recurringRules.pausedUntil,
  autoPost: recurringRules.autoPost,
  createdBy: recurringRules.createdBy,
  createdAt: recurringRules.createdAt,
} as const

/* --------------------------------------------------------------------- rules */

export async function findRules(tx: Executor, workspaceId: string): Promise<RecurringRuleRow[]> {
  return tx
    .select(ruleColumns)
    .from(recurringRules)
    .where(eq(recurringRules.workspaceId, workspaceId))
    .orderBy(asc(recurringRules.name), asc(recurringRules.id))
}

export async function findRuleById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<RecurringRuleRow | undefined> {
  const [row] = await tx
    .select(ruleColumns)
    .from(recurringRules)
    .where(and(eq(recurringRules.workspaceId, workspaceId), eq(recurringRules.id, id)))
    .limit(1)
  return row
}

/** Every rule of one series, oldest first: what a "this and future" edit has already split. */
export async function findSeriesRules(
  tx: Executor,
  workspaceId: string,
  seriesId: string,
): Promise<RecurringRuleRow[]> {
  return tx
    .select(ruleColumns)
    .from(recurringRules)
    .where(and(eq(recurringRules.workspaceId, workspaceId), eq(recurringRules.seriesId, seriesId)))
    .orderBy(asc(recurringRules.startDate), asc(recurringRules.id))
}

export interface InsertRuleInput {
  id: string
  workspaceId: string
  seriesId: string
  name: string
  kind: string
  payee: string | null
  notes: string | null
  amount: string
  currency: string
  amountMode: string
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  goalId: string | null
  freq: string
  interval: number
  startDate: PlainDate
  byMonthDay: number | null
  weekendPolicy: string
  endDate: PlainDate | null
  maxCount: number | null
  autoPost: boolean
  createdBy: string | null
}

export async function insertRule(
  tx: Executor,
  input: InsertRuleInput,
): Promise<RecurringRuleRow | undefined> {
  const [row] = await tx.insert(recurringRules).values(input).returning(ruleColumns)
  return row
}

export interface UpdateRulePatch {
  name?: string
  payee?: string | null
  notes?: string | null
  amount?: string
  amountMode?: string
  accountId?: string
  toAccountId?: string | null
  categoryId?: string | null
  goalId?: string | null
  freq?: string
  interval?: number
  startDate?: PlainDate
  byMonthDay?: number | null
  weekendPolicy?: string
  endDate?: PlainDate | null
  maxCount?: number | null
  status?: string
  pausedFrom?: PlainDate | null
  pausedUntil?: PlainDate | null
  autoPost?: boolean
}

export async function updateRule(
  tx: Executor,
  workspaceId: string,
  id: string,
  patch: UpdateRulePatch,
): Promise<RecurringRuleRow | undefined> {
  const [row] = await tx
    .update(recurringRules)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(recurringRules.workspaceId, workspaceId), eq(recurringRules.id, id)))
    .returning(ruleColumns)
  return row
}

/**
 * Removes a rule and, by cascade, its exceptions.
 *
 * Its posted transactions stay: the money moved, whatever became of the rule that predicted it.
 * They keep `occurrence_date` and lose `recurring_rule_id`, which the schema explains.
 */
export async function deleteRule(tx: Executor, workspaceId: string, id: string): Promise<boolean> {
  const rows = await tx
    .delete(recurringRules)
    .where(and(eq(recurringRules.workspaceId, workspaceId), eq(recurringRules.id, id)))
    .returning({ id: recurringRules.id })
  return rows.length > 0
}

/* ---------------------------------------------------------------- exceptions */

export interface RecurrenceExceptionRow {
  ruleId: string
  originalDate: string
  action: string
  overrideDate: string | null
  overrideAmount: string | null
}

const exceptionColumns = {
  ruleId: recurrenceExceptions.ruleId,
  originalDate: recurrenceExceptions.originalDate,
  action: recurrenceExceptions.action,
  overrideDate: recurrenceExceptions.overrideDate,
  overrideAmount: recurrenceExceptions.overrideAmount,
} as const

export async function findExceptions(
  tx: Executor,
  workspaceId: string,
  ruleIds: readonly string[],
): Promise<RecurrenceExceptionRow[]> {
  if (ruleIds.length === 0) return []
  return tx
    .select(exceptionColumns)
    .from(recurrenceExceptions)
    .where(
      and(
        eq(recurrenceExceptions.workspaceId, workspaceId),
        inArray(recurrenceExceptions.ruleId, [...ruleIds]),
      ),
    )
    .orderBy(asc(recurrenceExceptions.originalDate))
}

export interface UpsertExceptionInput {
  workspaceId: string
  ruleId: string
  originalDate: PlainDate
  action: string
  overrideDate: PlainDate | null
  overrideAmount: string | null
}

/**
 * Writes the one exception an occurrence may have, replacing whatever was there.
 *
 * Replacing rather than erroring is what makes skip and override idempotent: tapping "skip"
 * twice, or overriding an already-overridden occurrence, is the user restating their intent.
 */
export async function upsertException(
  tx: Executor,
  input: UpsertExceptionInput,
): Promise<RecurrenceExceptionRow | undefined> {
  const [row] = await tx
    .insert(recurrenceExceptions)
    .values(input)
    .onConflictDoUpdate({
      target: [recurrenceExceptions.ruleId, recurrenceExceptions.originalDate],
      set: {
        action: input.action,
        overrideDate: input.overrideDate,
        overrideAmount: input.overrideAmount,
        updatedAt: new Date(),
      },
    })
    .returning(exceptionColumns)
  return row
}

export async function deleteException(
  tx: Executor,
  workspaceId: string,
  ruleId: string,
  originalDate: PlainDate,
): Promise<boolean> {
  const rows = await tx
    .delete(recurrenceExceptions)
    .where(
      and(
        eq(recurrenceExceptions.workspaceId, workspaceId),
        eq(recurrenceExceptions.ruleId, ruleId),
        eq(recurrenceExceptions.originalDate, originalDate),
      ),
    )
    .returning({ ruleId: recurrenceExceptions.ruleId })
  return rows.length > 0
}

/* ------------------------------------------------------- posted occurrences */

export interface PostedOccurrenceRow {
  ruleId: string
  occurrenceDate: string
  transactionId: string
}

/**
 * Which occurrences already have a transaction (§11).
 *
 * Soft-deleted transactions are excluded, which is what hands an occurrence back as due when the
 * user undoes a confirm — the same condition the partial unique index behind the duplicate check
 * uses, so the read and the constraint can never disagree.
 */
export async function findPostedOccurrences(
  tx: Executor,
  workspaceId: string,
  ruleIds: readonly string[],
): Promise<PostedOccurrenceRow[]> {
  if (ruleIds.length === 0) return []
  const rows = await tx
    .select({
      ruleId: transactions.recurringRuleId,
      occurrenceDate: transactions.occurrenceDate,
      transactionId: transactions.id,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        inArray(transactions.recurringRuleId, [...ruleIds]),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.occurrenceDate))

  // The `inArray` and the partial index guarantee both columns are set on every row returned.
  return rows.filter(
    (row): row is PostedOccurrenceRow => row.ruleId !== null && row.occurrenceDate !== null,
  )
}

/* ------------------------------------------------------------- for the worker */

export interface AutoPostWorkspaceRow {
  id: string
  baseCurrency: string
  periodStartDay: number
  timezone: string
}

/**
 * The workspaces that have at least one auto-posting rule, for the daily job.
 *
 * **Not workspace-scoped**, deliberately and uniquely: the worker runs for everybody and has no
 * session to scope by. It is reached only from `runAutoPost`, which then works one workspace at a
 * time through the ordinary scoped queries above.
 */
export async function findAutoPostWorkspaces(tx: Executor): Promise<AutoPostWorkspaceRow[]> {
  return tx
    .selectDistinct({
      id: workspaces.id,
      baseCurrency: workspaces.baseCurrency,
      periodStartDay: workspaces.periodStartDay,
      timezone: workspaces.timezone,
    })
    .from(workspaces)
    .innerJoin(recurringRules, eq(recurringRules.workspaceId, workspaces.id))
    .where(eq(recurringRules.autoPost, true))
}

/** The auto-posting rules of one workspace. */
export async function findAutoPostRules(
  tx: Executor,
  workspaceId: string,
): Promise<RecurringRuleRow[]> {
  return tx
    .select(ruleColumns)
    .from(recurringRules)
    .where(and(eq(recurringRules.workspaceId, workspaceId), eq(recurringRules.autoPost, true)))
    .orderBy(asc(recurringRules.startDate), asc(recurringRules.id))
}

/**
 * Every workspace that has a repeating sinking fund, for the daily roll-forward (decision D12).
 *
 * **Not workspace-scoped**, for the same reason as `findAutoPostWorkspaces`: it is reached only
 * from the worker, which then uses the goals module's own scoped queries.
 */
export async function findRepeatingGoalWorkspaces(tx: Executor): Promise<AutoPostWorkspaceRow[]> {
  return tx
    .selectDistinct({
      id: workspaces.id,
      baseCurrency: workspaces.baseCurrency,
      periodStartDay: workspaces.periodStartDay,
      timezone: workspaces.timezone,
    })
    .from(workspaces)
    .where(
      sql`EXISTS (
        SELECT 1 FROM goals
        WHERE goals.workspace_id = ${workspaces.id}
          AND goals.repeat IS NOT NULL
          AND goals.archived_at IS NULL
      )`,
    )
}
