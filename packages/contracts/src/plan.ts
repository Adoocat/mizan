import { PLAN_LINE_TARGETS, PLAN_PERIOD_STATUSES, type PlanLineTarget } from '@mizan/domain'
import { z } from 'zod'
import { categoryGroupKindSchema } from './categories.ts'
import { moneySchema, plainDateSchema } from './primitives.ts'

export const planPeriodStatusSchema = z.enum(PLAN_PERIOD_STATUSES)
export const planLineTargetSchema = z.enum(
  PLAN_LINE_TARGETS as unknown as [PlanLineTarget, ...PlanLineTarget[]],
)

export const planLabelSchema = z.string().trim().max(120)

/** An allocation the client sends. Never negative: money is moved, not un-planned (PLAN §10). */
const plannedAmountSchema = moneySchema.refine(
  (value) => !value.amount.startsWith('-'),
  'An allocation cannot be negative',
)

/* ------------------------------------------------------------------ reading */

/**
 * The period a plan belongs to (§6).
 *
 * The bounds are half-open: `end` is the first day of the next period. They come from the server
 * rather than being recomputed by the client, because a workspace that moved its payday has
 * periods on both anchors and only the stored row knows which is which. `previousStart` and
 * `nextStart` are what the month switcher navigates to.
 */
export const planPeriodSchema = z.object({
  /** Null until something is planned in the month: the period row is written on the first edit. */
  id: z.uuid().nullable(),
  start: plainDateSchema,
  end: plainDateSchema,
  status: planPeriodStatusSchema,
  closedAt: z.string().nullable(),
  previousStart: plainDateSchema,
  nextStart: plainDateSchema,
  /** Complete days of the period, and its length, for the expected-pace marker (§16). */
  daysElapsed: z.number().int().min(0),
  days: z.number().int().min(1),
})
export type PlanPeriodDto = z.infer<typeof planPeriodSchema>

/**
 * What answers for a category's spending when it has no allocation of its own (§10).
 *
 * - `pool` — a flexible category covered by "Available to spend". Its spending is counted on the
 *   pool line, not against the category.
 * - `parent` — a subcategory without its own line: its parent's line covers it.
 *
 * Null means the row answers for itself: either it has a line, or it has none and nothing covers
 * it, in which case anything spent on it shows up as an overspend the plan never accounted for.
 */
export const planRowCoverSchema = z.enum(['pool', 'parent'])

const planRowFields = {
  /** The stored line, or null when this row has no allocation yet. */
  lineId: z.uuid().nullable(),
  target: planLineTargetSchema,
  /** Null on the pool line. */
  categoryId: z.uuid().nullable(),
  planned: moneySchema,
  /** What the previous period's close carried into this line. Zero until phase 10. */
  carryIn: moneySchema,
  /** Spending in the category this period, subcategories without a line included. */
  actual: moneySchema,
  /** `planned + carryIn − actual`; zero on a covered row, whose cover carries it instead. */
  available: moneySchema,
  overspend: moneySchema,
  rollover: z.boolean(),
  coveredBy: planRowCoverSchema.nullable(),
  sortOrder: z.number().int(),
  /** Bumped on every edit; pass it back to a write to be told when it is stale. Null with no line. */
  version: z.number().int().min(1).nullable(),
} as const

/** A subcategory's row. Two levels is the limit, so a child has no children of its own (§6). */
export const planChildRowSchema = z.object(planRowFields)
export type PlanChildRowDto = z.infer<typeof planChildRowSchema>

/**
 * One row of the plan.
 *
 * `planned`, `carryIn` and `actual` are the facts; `available` and `overspend` are what the
 * domain makes of them, computed on the server so the page never has to. The web app recomputes
 * the same two numbers with the same functions while an amount is being typed — the live preview
 * and the saved answer therefore agree by construction (§16).
 */
export const planRowSchema = z.object({
  ...planRowFields,
  children: z.array(planChildRowSchema),
})
export type PlanRowDto = z.infer<typeof planRowSchema>

/**
 * The rows grouped the way the Plan page stacks them: the workspace's category groups in plan
 * order, then the pool as a group of its own (§13). Income groups are not here — income is
 * planned as items, not as allocations.
 *
 * The totals count only the rows that answer for themselves (`coveredBy` null), so spending the
 * pool or a parent category already carries is never counted twice.
 */
export const planGroupSchema = z.object({
  /** Null for the pool group, which is not a category group. */
  id: z.uuid().nullable(),
  kind: z.union([categoryGroupKindSchema, z.literal('pool')]),
  name: z.string(),
  systemKey: z.string().nullable(),
  renamed: z.boolean(),
  sortOrder: z.number().int(),
  rows: z.array(planRowSchema),
  planned: moneySchema,
  actual: moneySchema,
  available: moneySchema,
  /** The sum of each row's overspend, which a positive `available` must not hide (§10). */
  overspend: moneySchema,
})
export type PlanGroupDto = z.infer<typeof planGroupSchema>

export const planIncomeItemSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  label: z.string().nullable(),
  expected: moneySchema,
  expectedDate: plainDateSchema.nullable(),
  /** Set once the user confirms what arrived; from then on it is what the plan counts (§10). */
  received: moneySchema.nullable(),
  receivedAt: z.string().nullable(),
  /** Income recorded in this item's category during the period, from the ledger. */
  categoryActual: moneySchema,
  sortOrder: z.number().int(),
})
export type PlanIncomeItemDto = z.infer<typeof planIncomeItemSchema>

/** The three numbers the plan is judged by, plus what the month has actually done so far. */
export const planSummarySchema = z.object({
  /** `I`: every income category's counted amount (§10). */
  income: moneySchema,
  /** The part of `income` that no plan item accounts for. */
  unplannedIncome: moneySchema,
  /** What the previous period's close left to the pool. Zero until phase 10. */
  poolCarryIn: moneySchema,
  /** `A = Σ planned`. */
  allocated: moneySchema,
  /** `U = I + pool carry-in − A`. Negative means the plan is over-allocated. */
  unassigned: moneySchema,
  /** Everything recorded against a line or the pool this period. */
  spent: moneySchema,
  /** The sum of every row's overspend. */
  overspend: moneySchema,
  /** On-budget spending with no category at all. Counted on the pool line (§10). */
  uncategorizedSpending: moneySchema,
})
export type PlanSummary = z.infer<typeof planSummarySchema>

export const planResponseSchema = z.object({
  period: planPeriodSchema,
  summary: planSummarySchema,
  groups: z.array(planGroupSchema),
  incomeItems: z.array(planIncomeItemSchema),
  /** The start date of an earlier period worth copying from, or null when there is none. */
  copyableFrom: plainDateSchema.nullable(),
})
export type PlanResponse = z.infer<typeof planResponseSchema>

/* ------------------------------------------------------------------ writing */

/**
 * Sets what a line is allocated, creating it if the target has none yet (flow F3).
 *
 * Addressing the line by its target rather than by its id is what makes inline editing a single
 * round trip: the Plan page shows a row for every category, whether or not it has an amount, and
 * typing into one is the same request either way. An allocation of zero removes the line, which
 * hands a flexible category back to the pool and a subcategory back to its parent.
 */
export const upsertPlanLineSchema = z
  .object({
    target: planLineTargetSchema,
    categoryId: z.uuid().optional(),
    planned: plannedAmountSchema,
    rollover: z.boolean().optional(),
    /** The version the user was looking at. An older one means someone else got there first. */
    version: z.number().int().min(1).optional(),
  })
  .refine((value) => (value.target === 'category') === (value.categoryId !== undefined), {
    message: 'A category line needs a categoryId, and no other line may have one',
    path: ['categoryId'],
  })
  // Goal lines arrive with goals themselves, in phase 8.
  .refine((value) => value.target !== 'goal', {
    message: 'Goal lines are not available yet',
    path: ['target'],
  })
export type UpsertPlanLineInput = z.infer<typeof upsertPlanLineSchema>

export const createPlanIncomeItemSchema = z.object({
  id: z.uuid().optional(),
  categoryId: z.uuid(),
  label: planLabelSchema.optional(),
  expected: plannedAmountSchema,
  expectedDate: plainDateSchema.optional(),
})
export type CreatePlanIncomeItemInput = z.infer<typeof createPlanIncomeItemSchema>

/**
 * Edits an income item. Sending `received` is how the plan switches from the expected amount to
 * what actually arrived (flow F2); sending null for it undoes that.
 */
export const updatePlanIncomeItemSchema = z
  .object({
    categoryId: z.uuid(),
    label: planLabelSchema.nullable(),
    expected: plannedAmountSchema,
    expectedDate: plainDateSchema.nullable(),
    received: plannedAmountSchema.nullable(),
  })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  })
export type UpdatePlanIncomeItemInput = z.infer<typeof updatePlanIncomeItemSchema>

/**
 * Copies an earlier period's allocations into this one (flow F3).
 *
 * Lines the target already has are left alone — a copy must never overwrite an amount the user
 * typed — and income items are copied only into a month that has none, with their expected dates
 * moved by the same offset from the period's start so payday stays payday.
 */
export const copyPlanSchema = z.object({
  includeIncome: z.boolean().optional(),
})
export type CopyPlanInput = z.infer<typeof copyPlanSchema>

export const copyPlanResponseSchema = z.object({
  plan: planResponseSchema,
  copiedLines: z.number().int().min(0),
  copiedIncomeItems: z.number().int().min(0),
  /** Lines the target period already had, which the copy left untouched. */
  skippedLines: z.number().int().min(0),
})
export type CopyPlanResponse = z.infer<typeof copyPlanResponseSchema>
