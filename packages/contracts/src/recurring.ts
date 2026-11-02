import {
  AMOUNT_MODES,
  MAX_MONTH_DAY,
  MAX_RECURRENCE_COUNT,
  MAX_RECURRENCE_INTERVAL,
  MIN_MONTH_DAY,
  MIN_RECURRENCE_INTERVAL,
  Money,
  OCCURRENCE_STATES,
  RECURRENCE_EXCEPTION_ACTIONS,
  RECURRENCE_FREQUENCIES,
  RECURRING_RULE_KINDS,
  RECURRING_RULE_STATUSES,
  WEEKEND_POLICIES,
} from '@mizan/domain'
import { z } from 'zod'
import { moneySchema, plainDateSchema } from './primitives.ts'

export const recurrenceFrequencySchema = z.enum(RECURRENCE_FREQUENCIES)
export const weekendPolicySchema = z.enum(WEEKEND_POLICIES)
export const recurringRuleKindSchema = z.enum(RECURRING_RULE_KINDS)
export const amountModeSchema = z.enum(AMOUNT_MODES)
export const recurringRuleStatusSchema = z.enum(RECURRING_RULE_STATUSES)
export const occurrenceStateSchema = z.enum(OCCURRENCE_STATES)
export const recurrenceExceptionActionSchema = z.enum(RECURRENCE_EXCEPTION_ACTIONS)

export const recurringRuleNameSchema = z.string().trim().min(1).max(80)
export const recurringPayeeSchema = z.string().trim().max(120)
export const recurringNotesSchema = z.string().trim().max(500)

export const recurrenceIntervalSchema = z
  .number()
  .int()
  .min(MIN_RECURRENCE_INTERVAL)
  .max(MAX_RECURRENCE_INTERVAL)

export const byMonthDaySchema = z.number().int().min(MIN_MONTH_DAY).max(MAX_MONTH_DAY)

export const maxCountSchema = z.number().int().min(1).max(MAX_RECURRENCE_COUNT)

/** A rule's amount. Never negative: the sign comes from the kind, exactly as in the ledger. */
const ruleAmountSchema = moneySchema.refine(
  (value) => !Money.fromDto(value).isNegative(),
  'An amount cannot be negative',
)

/* ------------------------------------------------------------------ reading */

/**
 * One recurring rule as the API returns it (PLAN §11).
 *
 * The stored facts are the schedule, the amount and what the money is for; `finished`,
 * `nextDueDate` and `monthlyEquivalent` are what the domain makes of them. None of the three is
 * stored — a rule that had its own "ended" flag or its own "next date" would be free to drift
 * away from the dates its schedule actually produces.
 */
export const recurringRuleSchema = z.object({
  id: z.uuid(),
  /**
   * The series this rule belongs to.
   *
   * A "this and future" edit ends one rule and starts another from that date, and both carry the
   * same `seriesId` — so "the rent" stays one thing in the user's head while the history keeps
   * what the rent actually was in June (§11).
   */
  seriesId: z.uuid(),
  name: recurringRuleNameSchema,
  kind: recurringRuleKindSchema,
  payee: z.string().nullable(),
  notes: z.string().nullable(),
  amount: moneySchema,
  /** `estimated` amounts are shown with a "~" and asked for again on confirm (§11). */
  amountMode: amountModeSchema,
  /** Where the money leaves from, or arrives in for income. */
  accountId: z.uuid(),
  /** A transfer's destination. Null on anything else. */
  toAccountId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  /**
   * The goal this rule is about, if any. What it means follows the kind: on an expense or income
   * the occurrence is **funded from** the goal, and on a transfer it **earmarks** for it (§9).
   */
  goalId: z.uuid().nullable(),

  freq: recurrenceFrequencySchema,
  interval: recurrenceIntervalSchema,
  startDate: plainDateSchema,
  /** The day of the month a monthly rule falls on; null takes it from `startDate`. */
  byMonthDay: byMonthDaySchema.nullable(),
  weekendPolicy: weekendPolicySchema,
  /** The last date an occurrence may fall on, inclusive. */
  endDate: plainDateSchema.nullable(),
  maxCount: maxCountSchema.nullable(),
  status: recurringRuleStatusSchema,
  pausedFrom: plainDateSchema.nullable(),
  pausedUntil: plainDateSchema.nullable(),
  /** Opt-in, and only ever for a fixed amount (§11). */
  autoPost: z.boolean(),

  /** Derived: the series has nothing left on or after today. */
  finished: z.boolean(),
  /** Derived: the next date money is expected, skips and overrides applied. Null once finished. */
  nextDueDate: plainDateSchema.nullable(),
  /** Derived: what the rule costs in an average month, whatever its frequency. */
  monthlyEquivalent: moneySchema,
  /** The series' last date, when either limit gives it one. */
  lastDate: plainDateSchema.nullable(),
  createdAt: z.string(),
})
export type RecurringRuleDto = z.infer<typeof recurringRuleSchema>

/**
 * One occurrence of a rule (§11). Virtual: nothing in the database corresponds to this row until
 * it is confirmed, and then what exists is a transaction.
 *
 * `originalDate` is its identity — the date every endpoint addresses it by — and `dueDate` is
 * when the money is actually expected. They differ when the weekend policy moved it, or when the
 * user overrode that one occurrence.
 */
export const occurrenceSchema = z.object({
  ruleId: z.uuid(),
  /** Repeated from the rule so a list of occurrences needs no second request to render. */
  ruleName: recurringRuleNameSchema,
  kind: recurringRuleKindSchema,
  payee: z.string().nullable(),
  originalDate: plainDateSchema,
  dueDate: plainDateSchema,
  state: occurrenceStateSchema,
  amount: moneySchema,
  /** True when the amount is still a guess, which is what the "~" in the UI means. */
  estimated: z.boolean(),
  /** True when a single-occurrence edit moved this one's date or amount. */
  overridden: z.boolean(),
  accountId: z.uuid(),
  toAccountId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  goalId: z.uuid().nullable(),
  /** The transaction that posted it, when it is posted. */
  transactionId: z.uuid().nullable(),
  /** How many days past due, for the "overdue 3 days" line. Zero unless overdue. */
  overdueDays: z.number().int().min(0),
})
export type OccurrenceDto = z.infer<typeof occurrenceSchema>

export const recurringListResponseSchema = z.object({
  rules: z.array(recurringRuleSchema),
  /**
   * Σ `monthlyEquivalent` over the rules that are still running: the "committed before spending"
   * figure on the Upcoming page. Paused and finished rules are left out — they commit nothing.
   */
  committedMonthly: moneySchema,
})
export type RecurringListResponse = z.infer<typeof recurringListResponseSchema>

/** One rule with the occurrences of its own window: `GET /recurring/:id/occurrences`. */
export const ruleOccurrencesResponseSchema = z.object({
  rule: recurringRuleSchema,
  from: plainDateSchema,
  to: plainDateSchema,
  occurrences: z.array(occurrenceSchema),
})
export type RuleOccurrencesResponse = z.infer<typeof ruleOccurrencesResponseSchema>

/**
 * `GET /upcoming?days=7`: what is coming, and what was missed (§11, flow F6).
 *
 * Overdue items are listed separately rather than mixed into the window, because they are a
 * different question — "what did I miss" rather than "what is next" — and the dashboard's
 * Needs-attention list asks only the first one.
 */
export const upcomingResponseSchema = z.object({
  today: plainDateSchema,
  from: plainDateSchema,
  to: plainDateSchema,
  /** Due before today and neither posted nor skipped, newest first. */
  overdue: z.array(occurrenceSchema),
  /** Due from today to the end of the window, soonest first. */
  occurrences: z.array(occurrenceSchema),
  /** Σ of the overdue expenses. */
  overdueTotal: moneySchema,
  /** Σ of the expenses due in the window: the "next 7 days" figure. */
  dueTotal: moneySchema,
  /** Σ of the income expected in the window. */
  incomeTotal: moneySchema,
  /** Σ of the transfers planned in the window, which includes goal contributions. */
  transferTotal: moneySchema,
  /** The next income occurrence, which the mockup's "next income" tile names. */
  nextIncome: occurrenceSchema.nullable(),
  /** What the on-budget accounts hold now. */
  onBudgetBalance: moneySchema,
  /**
   * What they would hold once everything in the window has happened.
   *
   * A single subtraction, not a day-by-day projection: a transfer inside the budget counts for
   * nothing, and the lowest-balance-of-the-month figure needs the forecast engine that arrives
   * with the calendar grid in v1.1 (§20, phase 19).
   */
  balanceAfterUpcoming: moneySchema,
})
export type UpcomingResponse = z.infer<typeof upcomingResponseSchema>

/* ------------------------------------------------------------------ writing */

const createRuleBase = {
  /** Client-supplied, which is what makes a create idempotent (§12). */
  id: z.uuid().optional(),
  name: recurringRuleNameSchema,
  payee: recurringPayeeSchema.optional(),
  notes: recurringNotesSchema.optional(),
  amount: ruleAmountSchema,
  amountMode: amountModeSchema.optional(),
  freq: recurrenceFrequencySchema,
  interval: recurrenceIntervalSchema.optional(),
  startDate: plainDateSchema,
  byMonthDay: byMonthDaySchema.optional(),
  weekendPolicy: weekendPolicySchema.optional(),
  endDate: plainDateSchema.optional(),
  maxCount: maxCountSchema.optional(),
  autoPost: z.boolean().optional(),
}

/**
 * A rule for money going out: rent, a subscription, a loan installment.
 *
 * `goalId` here means the occurrence is **funded from** that goal — the sinking fund paying the
 * insurance it was saved for — which is the same thing a goal-funded expense means in the ledger
 * (§9, ADR 0013).
 */
export const createExpenseRuleSchema = z.object({
  kind: z.literal('expense'),
  ...createRuleBase,
  accountId: z.uuid(),
  categoryId: z.uuid().optional(),
  goalId: z.uuid().optional(),
})

export const createIncomeRuleSchema = z.object({
  kind: z.literal('income'),
  ...createRuleBase,
  accountId: z.uuid(),
  categoryId: z.uuid().optional(),
  goalId: z.uuid().optional(),
})

/**
 * A rule that moves money between the user's own accounts (§11).
 *
 * `goalId` here means the opposite of what it means on an expense: the transfer **earmarks** for
 * that goal, so confirming it records the transfer and the contribution together (flow F8).
 */
export const createTransferRuleSchema = z.object({
  kind: z.literal('transfer'),
  ...createRuleBase,
  accountId: z.uuid(),
  toAccountId: z.uuid(),
  goalId: z.uuid().optional(),
})

export const createRecurringRuleSchema = z.discriminatedUnion('kind', [
  createExpenseRuleSchema,
  createIncomeRuleSchema,
  createTransferRuleSchema,
])
export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>

/**
 * How far an edit reaches (§11).
 *
 * - `all` — the whole series, in place. Posted occurrences are never rewritten: they are
 *   transactions, and what happened happened.
 * - `future` — the rule is ended the day before `from` and a new one with the same `seriesId`
 *   takes over from there, so June keeps the old rent and July gets the new one.
 *
 * "Only this" is not an edit of the rule at all; it is an override on the one occurrence.
 */
export const editScopeSchema = z.enum(['all', 'future'])
export type EditScope = z.infer<typeof editScopeSchema>

export const updateRecurringRuleSchema = z
  .object({
    scope: editScopeSchema.optional(),
    /** Required with `scope: "future"`: the first date the new rule applies from. */
    from: plainDateSchema.optional(),

    name: recurringRuleNameSchema,
    payee: recurringPayeeSchema.nullable(),
    notes: recurringNotesSchema.nullable(),
    amount: ruleAmountSchema,
    amountMode: amountModeSchema,
    accountId: z.uuid(),
    toAccountId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
    goalId: z.uuid().nullable(),
    freq: recurrenceFrequencySchema,
    interval: recurrenceIntervalSchema,
    startDate: plainDateSchema,
    byMonthDay: byMonthDaySchema.nullable(),
    weekendPolicy: weekendPolicySchema,
    endDate: plainDateSchema.nullable(),
    maxCount: maxCountSchema.nullable(),
    autoPost: z.boolean(),
  })
  .partial()
  .refine(
    (value) =>
      Object.entries(value).some(
        ([key, field]) => key !== 'scope' && key !== 'from' && field !== undefined,
      ),
    { message: 'Nothing to update' },
  )
  .refine((value) => value.scope !== 'future' || value.from !== undefined, {
    message: 'Editing this and future occurrences needs the date it applies from',
    path: ['from'],
  })
export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>

/**
 * Pauses a rule, or ends the pause (§11).
 *
 * `from` defaults to today rather than to the rule's start, so pausing the gym does not also
 * erase the two payments that were already overdue when the user paused it — those still
 * happened. `until` is exclusive: the rule is producing occurrences again on that date.
 */
export const pauseRecurringRuleSchema = z.object({
  from: plainDateSchema.optional(),
  until: plainDateSchema.optional(),
})
export type PauseRecurringRuleInput = z.infer<typeof pauseRecurringRuleSchema>

/** Ends a series (§11). `on` defaults to today, and is the last date an occurrence may fall on. */
export const endRecurringRuleSchema = z.object({
  on: plainDateSchema.optional(),
})
export type EndRecurringRuleInput = z.infer<typeof endRecurringRuleSchema>

/**
 * Confirms one occurrence: records that the money actually moved (flow F6).
 *
 * `amount` is what really arrived or left, which is the whole point for an estimated rule — the
 * electricity bill was ₺812.40, not the ₺720 the plan guessed. Everything else defaults to what
 * the rule says, so the common case is an empty body.
 */
export const confirmOccurrenceSchema = z.object({
  /** Client-supplied id for the transaction, which makes a double tap harmless (§12). */
  transactionId: z.uuid().optional(),
  amount: ruleAmountSchema.optional(),
  /** The date the money moved, if not the due date. */
  date: plainDateSchema.optional(),
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  notes: recurringNotesSchema.optional(),
})
export type ConfirmOccurrenceInput = z.infer<typeof confirmOccurrenceSchema>

/**
 * Overrides one occurrence — §11's "only this" (flow F6).
 *
 * At least one of the two has to be given: an override that changes neither the date nor the
 * amount says nothing, and would only be a row that makes the occurrence look edited.
 */
export const overrideOccurrenceSchema = z
  .object({
    date: plainDateSchema.optional(),
    amount: ruleAmountSchema.optional(),
  })
  .refine((value) => value.date !== undefined || value.amount !== undefined, {
    message: 'An override needs a new date or a new amount',
  })
export type OverrideOccurrenceInput = z.infer<typeof overrideOccurrenceSchema>

/** What a confirm answers with: the rule as it now stands and the transaction that was written. */
export const confirmOccurrenceResponseSchema = z.object({
  rule: recurringRuleSchema,
  occurrence: occurrenceSchema,
  transactionId: z.uuid(),
  /** True when the occurrence had already been posted, so nothing new was written (§12). */
  alreadyPosted: z.boolean(),
})
export type ConfirmOccurrenceResponse = z.infer<typeof confirmOccurrenceResponseSchema>

export const occurrenceResponseSchema = z.object({
  rule: recurringRuleSchema,
  occurrence: occurrenceSchema,
})
export type OccurrenceResponse = z.infer<typeof occurrenceResponseSchema>

/**
 * A recurring rule whose money the plan does not account for (§11).
 *
 * The warning the mockups show — *"Netflix (Subscriptions) isn't covered by the plan"* — and the
 * reason it is worth showing: a subscription with no line of its own is quietly coming out of
 * Available to spend, which is exactly the surprise the plan exists to prevent.
 */
export const uncoveredRecurringSchema = z.object({
  ruleId: z.uuid(),
  name: recurringRuleNameSchema,
  kind: recurringRuleKindSchema,
  categoryId: z.uuid().nullable(),
  goalId: z.uuid().nullable(),
  /** Σ of this rule's occurrences inside the period. */
  amount: moneySchema,
  occurrences: z.number().int().min(1),
})
export type UncoveredRecurringDto = z.infer<typeof uncoveredRecurringSchema>
