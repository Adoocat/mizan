/**
 * The monthly plan: the rules that turn a period's allocations and its recorded money into the
 * numbers the Plan page shows (PLAN §10, §16).
 *
 * Nothing here does I/O. SQL sums the ledger, the service hands those sums in, and these
 * functions decide what they mean: what a line has left, what is still unassigned, whether a
 * category is ahead of its pace. The web app calls the same functions while an amount is being
 * typed, so the live preview and the API can never disagree about the arithmetic.
 *
 * Every function takes and returns `Money`. Carry-ins arrive in phase 10 and plan moves in
 * phase 7; both are optional inputs here and default to zero, so the shape does not change when
 * those phases start filling them in.
 */
import { addDays, diffInDays, type PlainDate } from './dates.ts'
import { Decimal, decimal } from './decimal.ts'
import { Money } from './money.ts'
import { daysElapsed, periodLength, type Period } from './period.ts'

/* ------------------------------------------------------------------ targets */

/**
 * What an allocation is for (§6). A plan line points at exactly one of these:
 *
 * - `category` — a spending, debt, savings or investment category.
 * - `goal` — a goal's monthly contribution (phase 8).
 * - `pool` — the single "Available to spend" line that covers flexible spending without a line
 *   of its own.
 */
export const PLAN_LINE_TARGETS = ['category', 'goal', 'pool'] as const

export type PlanLineTarget = (typeof PLAN_LINE_TARGETS)[number]

export function isPlanLineTarget(value: unknown): value is PlanLineTarget {
  return typeof value === 'string' && (PLAN_LINE_TARGETS as readonly string[]).includes(value)
}

/** A period is open until it is closed in the month review (phase 10). */
export const PLAN_PERIOD_STATUSES = ['open', 'closed'] as const

export type PlanPeriodStatus = (typeof PLAN_PERIOD_STATUSES)[number]

export function isPlanPeriodStatus(value: unknown): value is PlanPeriodStatus {
  return typeof value === 'string' && (PLAN_PERIOD_STATUSES as readonly string[]).includes(value)
}

/* ------------------------------------------------------------------- a line */

/**
 * One plan line's money, as the service reads it.
 *
 * - `planned` — what the user allocated.
 * - `carryIn` — what last period's close carried into this line (phase 10).
 * - `movesIn` / `movesOut` — money reassigned between lines to cover an overspend (phase 7).
 * - `actual` — what has happened: spending in the category, or contributions to the goal. A
 *   refund is recorded as income in the same category, so it arrives here as a negative amount
 *   and reduces the actual (§10).
 */
export interface PlanLineFigures {
  readonly planned: Money
  readonly carryIn?: Money | undefined
  readonly movesIn?: Money | undefined
  readonly movesOut?: Money | undefined
  readonly actual: Money
}

/** Everything the line may spend: `planned + carry_in + moves_in − moves_out` (§10). */
export function planLineBudget(line: PlanLineFigures): Money {
  const zero = Money.zero(line.planned.currency)
  return line.planned
    .plus(line.carryIn ?? zero)
    .plus(line.movesIn ?? zero)
    .minus(line.movesOut ?? zero)
    .roundToMinor()
}

/** `Available(L) = budget − actual`. Negative means the line is overspent. */
export function planLineAvailable(line: PlanLineFigures): Money {
  return planLineBudget(line).minus(line.actual).roundToMinor()
}

/** `Overspend(L) = max(0, −Available(L))`: how far past its budget the line went. */
export function planLineOverspend(line: PlanLineFigures): Money {
  const available = planLineAvailable(line)
  return available.isNegative() ? available.negate() : Money.zero(available.currency)
}

/* ------------------------------------------------------------------ totals */

export interface PlanTotals {
  readonly planned: Money
  readonly carryIn: Money
  readonly actual: Money
  readonly available: Money
  /**
   * The sum of each line's overspend, **not** the overspend of the summed lines: a group where
   * one category is ₺110 over and another has ₺400 spare is still ₺110 overspent, and hiding
   * that behind a positive total is exactly the mistake this phase exists to avoid.
   */
  readonly overspend: Money
}

/** Group and whole-plan totals: the columns above and below the lines on the Plan page. */
export function planTotals(lines: readonly PlanLineFigures[], currency: string): PlanTotals {
  const zero = Money.zero(currency)
  const sum = (amounts: Money[]) => Money.sum(amounts, currency).roundToMinor()

  return {
    planned: sum(lines.map((line) => line.planned)),
    carryIn: sum(lines.map((line) => line.carryIn ?? zero)),
    actual: sum(lines.map((line) => line.actual)),
    available: sum(lines.map(planLineAvailable)),
    overspend: sum(lines.map(planLineOverspend)),
  }
}

/** `Allocated A = Σ planned(L)`. Plan moves net to zero, so they never change it (§10). */
export function allocatedTotal(
  lines: readonly { readonly planned: Money }[],
  currency: string,
): Money {
  return Money.sum(
    lines.map((line) => line.planned),
    currency,
  ).roundToMinor()
}

/* ------------------------------------------------------------------- income */

/**
 * What one income category contributes to the plan's income.
 *
 * - `expected` — the expected amounts of the items the user has **not** marked received.
 * - `received` — the amounts of the items they have. Once an item is received it is the actual
 *   figure that counts, which is how a ₺48,000 salary against a ₺50,000 expectation shows the
 *   plan as over-allocated (flow F2).
 * - `actual` — income recorded in this category during the period, from the ledger.
 */
export interface IncomeCategoryFigures {
  readonly expected: Money
  readonly received: Money
  readonly actual: Money
}

/**
 * `received + max(expected, actual − received)` (§10).
 *
 * An income item counts its expectation until the money shows up, and the arrival takes over as
 * soon as it exceeds it — a salary that lands as ₺53,500 against a ₺50,000 expectation counts
 * ₺53,500, with the extra ₺3,500 there to be assigned. Confirmed items are held out of the
 * comparison so their transaction cannot be counted a second time, and a category with no items
 * at all has `expected` of zero, which makes all of its income unplanned income.
 */
export function countedIncome(figures: IncomeCategoryFigures): Money {
  const currency = figures.expected.currency
  const unclaimed = Money.max(figures.actual.minus(figures.received), Money.zero(currency))
  return figures.received.plus(Money.max(figures.expected, unclaimed)).roundToMinor()
}

/** `Income I`: every income category's counted amount (§10). */
export function planIncome(categories: readonly IncomeCategoryFigures[], currency: string): Money {
  return Money.sum(categories.map(countedIncome), currency).roundToMinor()
}

/* --------------------------------------------------------------- unassigned */

export interface UnassignedFigures {
  readonly income: Money
  /** What last period's leftovers carried into the pool (phase 10). */
  readonly poolCarryIn?: Money | undefined
  readonly allocated: Money
}

/**
 * `Unassigned U = I + pool carry-in − A` (§10). The aim is zero: positive is money still to
 * assign, negative means the plan promises more than the month will bring.
 */
export function unassigned(figures: UnassignedFigures): Money {
  const zero = Money.zero(figures.income.currency)
  return figures.income
    .plus(figures.poolCarryIn ?? zero)
    .minus(figures.allocated)
    .roundToMinor()
}

/** Over-allocated: the plan assigns more than there is. Shown as a warning, never as spendable. */
export const isOverAllocated = (unassignedAmount: Money): boolean => unassignedAmount.isNegative()

/* ---------------------------------------------------------- pace and status */

/**
 * The expected-pace marker: the share of the period that has gone (§16).
 *
 * Zero before the period starts and one once it is over, so a closed month reads as fully
 * elapsed rather than as a line that is somehow ahead of itself.
 */
export function expectedPace(period: Period, today: PlainDate): Decimal {
  const length = periodLength(period)
  if (length <= 0) return new Decimal(1)
  return decimal(daysElapsed(period, today)).dividedBy(length)
}

/**
 * `actual ÷ budget`, the share of a line that is used up (§16).
 *
 * Null when there is nothing to divide by: a line with no budget has no meaningful percentage,
 * and the UI shows a dash rather than an infinity. A refund can make this negative.
 */
export function budgetUsage(line: PlanLineFigures): Decimal | null {
  const budget = planLineBudget(line)
  if (budget.isZero()) return null
  return line.actual.amount.dividedBy(budget.amount)
}

/** The three states a budget line can be in (§16); `BudgetProgress` colours the bar from it. */
export const BUDGET_STATUSES = ['onPace', 'aheadOfPace', 'over'] as const

export type BudgetStatus = (typeof BUDGET_STATUSES)[number]

/**
 * Where a line stands against the calendar (§16).
 *
 * `over` once it has spent more than its budget; `aheadOfPace` while it is inside the budget but
 * has used a larger share of it than the share of the period that has passed; `onPace`
 * otherwise. A line with no budget is `over` as soon as anything is spent on it, because every
 * lira of it is unplanned.
 */
export function budgetStatus(line: PlanLineFigures, pace: Decimal): BudgetStatus {
  if (planLineAvailable(line).isNegative()) return 'over'
  const usage = budgetUsage(line)
  if (usage === null) return 'onPace'
  return usage.greaterThan(0) && usage.greaterThanOrEqualTo(pace) ? 'aheadOfPace' : 'onPace'
}

/* ------------------------------------------------------------ copying ahead */

/**
 * Where an expected income date lands when a plan is copied into another period (flow F3).
 *
 * The offset from the start of the period is kept rather than the day of the month, so a plan
 * anchored to payday stays anchored to payday. A period shorter than its source — which happens
 * when the start day changes — clamps to its last day instead of spilling into the next month.
 */
export function shiftExpectedDate(date: PlainDate, from: Period, to: Period): PlainDate {
  const offset = Math.max(0, diffInDays(date, from.start))
  const lastOffset = Math.max(0, periodLength(to) - 1)
  return addDays(to.start, Math.min(offset, lastOffset))
}
