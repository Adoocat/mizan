import {
  EMERGENCY_FUND_MONTHS,
  GOAL_CONTRIBUTION_SOURCES,
  GOAL_REPEATS,
  GOAL_STATUSES,
  GOAL_TYPES,
  Money,
  type EmergencyFundMonths,
} from '@mizan/domain'
import { z } from 'zod'
import { moneySchema, plainDateSchema } from './primitives.ts'

export const goalTypeSchema = z.enum(GOAL_TYPES)
export const goalRepeatSchema = z.enum(GOAL_REPEATS)
export const goalStatusSchema = z.enum(GOAL_STATUSES)
export const goalContributionSourceSchema = z.enum(GOAL_CONTRIBUTION_SOURCES)

export const goalNameSchema = z.string().trim().min(1).max(80)
export const goalNoteSchema = z.string().trim().max(200)

export const emergencyFundMonthsSchema = z.union(
  EMERGENCY_FUND_MONTHS.map((months) => z.literal(months)) as [
    z.ZodLiteral<EmergencyFundMonths>,
    ...z.ZodLiteral<EmergencyFundMonths>[],
  ],
)

/** A target the client sends. Never negative: a goal is something to reach, not to owe. */
const targetAmountSchema = moneySchema.refine(
  (value) => !Money.fromDto(value).isNegative(),
  'A target cannot be negative',
)

/* ------------------------------------------------------------------ reading */

/**
 * One goal as the API returns it (PLAN §9).
 *
 * The facts are `target`, `earmarked` and `spent`; everything else — `saved`, `remaining`,
 * `progress`, `requiredMonthly`, `status` — is what the domain makes of them, computed on the
 * server so the page never has to. The web app recomputes the same figures with the same
 * functions while a contribution is being typed, so a preview and the saved answer agree.
 */
export const goalSchema = z.object({
  id: z.uuid(),
  type: goalTypeSchema,
  name: goalNameSchema,
  note: z.string().nullable(),
  /**
   * What the goal is for.
   *
   * On an emergency fund this is **derived** on every read — `emergencyMonths` × the current
   * plan's essential and debt lines — rather than stored, so it follows the household's real
   * cost of living (§9).
   */
  target: moneySchema,
  /** Null on a savings goal with no date, which is why `requiredMonthly` can be null too. */
  targetDate: plainDateSchema.nullable(),
  /** Set on an emergency fund, and the months of cover its target is built from. */
  emergencyMonths: emergencyFundMonthsSchema.nullable(),
  /** Set on a sinking fund that comes round again. Phase 9 rolls `targetDate` forward. */
  repeat: goalRepeatSchema.nullable(),
  /** Where the money is meant to sit, for the over-earmark warning. Null when unset. */
  keptInAccountId: z.uuid().nullable(),
  priority: z.number().int(),
  /** Σ contributions: earmarks positive, releases negative. */
  earmarked: moneySchema,
  /** What has been spent straight out of the goal: the goal-funded expense lines (§9). */
  spent: moneySchema,
  /** `earmarked − spent`: what the goal holds today. */
  saved: moneySchema,
  /** `max(0, target − saved)`. */
  remaining: moneySchema,
  /** `saved ÷ target` as a decimal string, or null when there is no target to divide by. */
  progress: z.string().nullable(),
  /**
   * `(target − saved) ÷ months left`, rounded up (§9).
   *
   * Null when the goal has no target date: no date means no denominator, so the card shows what
   * is left rather than a number that would mean nothing.
   */
  requiredMonthly: moneySchema.nullable(),
  /** Months left to contribute over, counted inclusively to the target month (§16). */
  monthsLeft: z.number().int().nullable(),
  /** What this period's plan line gives the goal, or null when it has no line. */
  plannedMonthly: moneySchema.nullable(),
  /** The plan line for this goal in the current period, for "add to plan" and its undo. */
  planLineId: z.uuid().nullable(),
  /**
   * When the goal finishes at its current plan line, derived rather than promised. Null without a
   * line, or when the line is too small ever to get there.
   */
  projectedFinish: plainDateSchema.nullable(),
  /** Months of essentials this fund covers (§16: 82,000 ÷ 24,800 = 3.3). Emergency funds only. */
  coverageMonths: z.string().nullable(),
  status: goalStatusSchema,
  /** Set once archived. An archived goal keeps its contributions as history. */
  archivedAt: z.string().nullable(),
})
export type GoalDto = z.infer<typeof goalSchema>

/** One recorded earmark or release (§9). Listed newest first on the goal's own page. */
export const goalContributionSchema = z.object({
  id: z.uuid(),
  goalId: z.uuid(),
  date: plainDateSchema,
  /** Signed: positive earmarks money for the goal, negative releases it back. */
  amount: moneySchema,
  source: goalContributionSourceSchema,
  /** The transfer this contribution was linked to, when it came from one. */
  transactionId: z.uuid().nullable(),
  /**
   * The plan month it counted in, when that month had been planned. Provenance only: a goal line
   * sums contributions by their own date (§10), so a back-dated earmark lands in the month the
   * money belongs to whether or not a period row existed for it.
   */
  periodId: z.uuid().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
})
export type GoalContributionDto = z.infer<typeof goalContributionSchema>

/**
 * The warning §9 asks for: *"₺X more is earmarked than this account holds"*.
 *
 * A warning and never a refusal — earmarks are the user's own bookkeeping, and the app only has
 * to be honest that the money is not there yet. One entry per account that is over-earmarked;
 * an account whose earmarks are all backed is absent.
 */
export const overEarmarkedAccountSchema = z.object({
  accountId: z.uuid(),
  balance: moneySchema,
  earmarked: moneySchema,
  /** `earmarked − balance`, always positive. */
  excess: moneySchema,
})
export type OverEarmarkedAccountDto = z.infer<typeof overEarmarkedAccountSchema>

export const goalListResponseSchema = z.object({
  goals: z.array(goalSchema),
  /** What every goal holds between them: the "committed" figure on the Goals page. */
  totalSaved: moneySchema,
  totalTarget: moneySchema,
  /** One month of essential and debt allocations, which every emergency fund target is built on. */
  essentialMonthly: moneySchema,
  overEarmarked: z.array(overEarmarkedAccountSchema),
})
export type GoalListResponse = z.infer<typeof goalListResponseSchema>

export const goalResponseSchema = z.object({
  goal: goalSchema,
  contributions: z.array(goalContributionSchema),
})
export type GoalResponse = z.infer<typeof goalResponseSchema>

/* ------------------------------------------------------------------ writing */

/**
 * Creates a goal (flow F7).
 *
 * The three types take different fields, which is why this is a union rather than one object with
 * everything optional: an emergency fund is defined by its months of cover and must not carry a
 * target of its own, since its target is derived; a sinking fund is defined by the date its bill
 * falls due; a savings goal needs a target and may or may not have a date.
 */
const createGoalBase = {
  /** Client-supplied, which is what makes a create idempotent (§12). */
  id: z.uuid().optional(),
  name: goalNameSchema,
  note: goalNoteSchema.optional(),
  keptInAccountId: z.uuid().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
}

export const createEmergencyFundSchema = z.object({
  type: z.literal('emergency_fund'),
  ...createGoalBase,
  /** 1, 3 or 6 months of essentials (§9). The target follows from it on every read. */
  emergencyMonths: emergencyFundMonthsSchema,
})

export const createSavingsGoalSchema = z.object({
  type: z.literal('savings'),
  ...createGoalBase,
  target: targetAmountSchema,
  targetDate: plainDateSchema.optional(),
})

export const createSinkingFundSchema = z.object({
  type: z.literal('sinking_fund'),
  ...createGoalBase,
  target: targetAmountSchema,
  /** A sinking fund is a bill with a date: that is what separates it from a savings goal. */
  targetDate: plainDateSchema,
  repeat: goalRepeatSchema.optional(),
})

export const createGoalSchema = z.discriminatedUnion('type', [
  createEmergencyFundSchema,
  createSavingsGoalSchema,
  createSinkingFundSchema,
])
export type CreateGoalInput = z.infer<typeof createGoalSchema>

/**
 * Edits a goal. The type never changes — an emergency fund and a sinking fund keep their targets
 * in different ways, so turning one into the other is a new goal, not an edit.
 */
export const updateGoalSchema = z
  .object({
    name: goalNameSchema,
    note: goalNoteSchema.nullable(),
    target: targetAmountSchema,
    targetDate: plainDateSchema.nullable(),
    emergencyMonths: emergencyFundMonthsSchema,
    repeat: goalRepeatSchema.nullable(),
    keptInAccountId: z.uuid().nullable(),
    priority: z.number().int().min(0).max(9999),
  })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  })
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>

/**
 * Records a contribution (flow F8).
 *
 * `amount` is signed, because an earmark and a release are the same act in two directions and
 * splitting them into two endpoints would duplicate every check. A `transactionId` links an
 * existing transfer to the goal — §9's fourth funding route — and the source is `transfer` then
 * rather than `manual`.
 */
export const createContributionSchema = z.object({
  id: z.uuid().optional(),
  amount: moneySchema.refine((value) => !Money.fromDto(value).isZero(), {
    message: 'A contribution cannot be zero',
  }),
  /** Defaults to today in the workspace's time zone. */
  date: plainDateSchema.optional(),
  note: goalNoteSchema.optional(),
  /** The transfer this contribution records, when the user is linking one afterwards. */
  transactionId: z.uuid().optional(),
})
export type CreateContributionInput = z.infer<typeof createContributionSchema>

/**
 * "Add to plan" (§9): gives the goal an allocation in the period being planned.
 *
 * The amount defaults to what the goal needs each month, which is the whole point of the button —
 * the user has just been told they need ₺3,000 a month and should not have to type it again.
 */
export const addGoalToPlanSchema = z.object({
  /** The month to plan in. Defaults to the current period. */
  start: plainDateSchema.optional(),
  /** Defaults to the goal's `requiredMonthly`, which must exist when it is omitted. */
  planned: targetAmountSchema.optional(),
})
export type AddGoalToPlanInput = z.infer<typeof addGoalToPlanSchema>
