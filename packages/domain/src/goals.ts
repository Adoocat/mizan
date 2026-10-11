/**
 * Goals: emergency funds, savings goals and sinking funds (PLAN §9, §16).
 *
 * A goal is a *purpose with a target*; where the money physically sits is an account's business,
 * and how much of it belongs to the goal is a **contribution** — an earmark, not a transfer. That
 * separation is the whole design: contributing moves nothing between accounts, so a single
 * savings account can carry an emergency fund, a Japan trip and next year's insurance at once
 * without any of them pretending to be a separate pot.
 *
 * Nothing here does I/O. SQL sums the contributions and the goal-funded spending, the service
 * hands those sums in, and these functions decide what they mean: what a goal holds, what it
 * still needs each month, and whether it is keeping up. The web app calls the same functions
 * while a contribution is being typed, so a preview and the saved answer agree by construction.
 */
import { toParts, type PlainDate } from './dates.ts'
import type { Decimal } from './decimal.ts'
import { Money } from './money.ts'
import type { Period } from './period.ts'

/* -------------------------------------------------------------------- types */

/**
 * The three kinds of goal (§9). The type decides where the target comes from, not how the money
 * is tracked — every MVP goal is funded by contributions (the `tracked` mode; `combined` goals
 * with live funding sources arrive in v2).
 *
 * - `emergency_fund` — months of essential spending. Its target is **derived** from the current
 *   plan rather than typed, so it follows the household's real cost of living.
 * - `savings` — a general target, with or without a date.
 * - `sinking_fund` — a known bill with a due date, optionally repeating.
 */
export const GOAL_TYPES = ['emergency_fund', 'savings', 'sinking_fund'] as const

export type GoalType = (typeof GOAL_TYPES)[number]

export class UnknownGoalTypeError extends Error {
  override name = 'UnknownGoalTypeError'
}

export function isGoalType(value: unknown): value is GoalType {
  return typeof value === 'string' && (GOAL_TYPES as readonly string[]).includes(value)
}

export function goalType(value: string): GoalType {
  if (!isGoalType(value)) throw new UnknownGoalTypeError(`Unknown goal type: ${value}`)
  return value
}

/** How often a sinking fund comes round again: annual insurance, quarterly tax (§9). */
export const GOAL_REPEATS = ['monthly', 'quarterly', 'annual'] as const

export type GoalRepeat = (typeof GOAL_REPEATS)[number]

export function isGoalRepeat(value: unknown): value is GoalRepeat {
  return typeof value === 'string' && (GOAL_REPEATS as readonly string[]).includes(value)
}

/** Months between one occurrence of a repeating sinking fund and the next. */
export const REPEAT_MONTHS: Record<GoalRepeat, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
}

/**
 * Where a contribution came from (§9).
 *
 * - `manual` — the user earmarked money they already have. Nothing moves between accounts.
 * - `plan_line` — a plan savings line marked done, which records the transfer and the earmark
 *   together (flow F2).
 * - `transfer` — an existing transfer linked to the goal afterwards.
 * - `rollover` — a period's leftover sent to the goal when the month closed (phase 10 writes
 *   these; the value exists now so a goal's history does not change shape when it arrives).
 *
 * Spending **out** of a goal is not in this list: a goal-funded expense carries `goal_id` on its
 * transaction line, and the ledger stays the one place that knows about it (see `goalSaved`).
 */
export const GOAL_CONTRIBUTION_SOURCES = ['manual', 'plan_line', 'transfer', 'rollover'] as const

export type GoalContributionSource = (typeof GOAL_CONTRIBUTION_SOURCES)[number]

export function isGoalContributionSource(value: unknown): value is GoalContributionSource {
  return (
    typeof value === 'string' && (GOAL_CONTRIBUTION_SOURCES as readonly string[]).includes(value)
  )
}

/* ------------------------------------------------------------- what it holds */

export interface GoalBalanceFigures {
  /**
   * Σ of the goal's contributions: an earmark is positive, a release negative. A release is how
   * money goes back to being free to spend without any of it leaving an account.
   */
  readonly earmarked: Money
  /**
   * What has been spent straight out of the goal, as a positive amount: the goal-funded expense
   * lines. This is what makes a sinking fund work — the money was earmarked in earlier months,
   * so paying the bill must reduce the goal rather than this month's spending (§9, §10).
   */
  readonly spent: Money
}

/**
 * What a goal holds today: `earmarked − spent` (§9).
 *
 * Spending is subtracted here rather than stored as a negative contribution, so the ledger stays
 * the single source of truth: undeleting the expense, or correcting its amount, moves the goal
 * with it and no second row can drift out of step.
 */
export function goalSaved(figures: GoalBalanceFigures): Money {
  return figures.earmarked.minus(figures.spent).roundToMinor()
}

export interface GoalTargetFigures {
  readonly target: Money
  readonly saved: Money
}

/** What is still to be found: `max(0, target − saved)`. Zero once the goal is funded. */
export function goalRemaining({ target, saved }: GoalTargetFigures): Money {
  const remaining = target.minus(saved).roundToMinor()
  return remaining.isPositive() ? remaining : Money.zero(target.currency)
}

/**
 * `saved ÷ target`, the share of the goal that is funded (§16).
 *
 * Null when there is nothing to divide by, so the UI shows a dash rather than an infinity. It can
 * exceed one: over-funding a goal is allowed and the ring says so, because a goal holding more
 * than it needs is information, not an error.
 */
export function goalProgress({ target, saved }: GoalTargetFigures): Decimal | null {
  if (target.isZero()) return null
  return saved.amount.dividedBy(target.amount)
}

/** Whether the goal has reached what it was for. An empty target is never funded. */
export function isGoalFunded({ target, saved }: GoalTargetFigures): boolean {
  return target.isPositive() && saved.greaterThanOrEqual(target)
}

/* ------------------------------------------------------------ required monthly */

/**
 * Contribution months left, counted **inclusively to the target month** (§16).
 *
 * A goal due this month has one month to do it in, not zero — which is what keeps the division
 * below from having to special-case the last month. Only the months matter, not the days: a bill
 * due on the 3rd and one due on the 28th are both this month's problem.
 *
 * Zero or negative once the target month has passed.
 */
export function contributionMonthsLeft(period: Period, targetDate: PlainDate): number {
  const from = toParts(period.start)
  const to = toParts(targetDate)
  return (to.year - from.year) * 12 + (to.month - from.month) + 1
}

export interface RequiredMonthlyFigures extends GoalTargetFigures {
  /**
   * Months left to contribute over, or **null** when the goal has no target date.
   *
   * Null is not zero: a savings goal with no date has no required monthly amount at all, and
   * inventing a denominator would put a number on the card that means nothing. The API returns
   * null and the page shows progress and what is left instead.
   */
  readonly monthsLeft: number | null
}

/**
 * What the goal needs each month to get there: `(target − saved) ÷ months left` (§9).
 *
 * The examples from §9: ₺100,000 over ten months is **₺10,000** a month; ₺15,000 over five months
 * is **₺3,000**.
 *
 * Rounded **up** to the minor unit, which is the opposite of the daily allowance's rounding and
 * for the same reason: an allowance must never promise more than there is, while a contribution
 * must never fall short of the target. ₺10,000 over three months is ₺3,333.34, and three of those
 * clear the goal with two kuruş to spare.
 *
 * Returns null when there is no date to work towards, and the whole remainder once the target
 * month has passed — an overdue goal needs all of it now, not a share of a month that is gone.
 */
export function requiredMonthly(figures: RequiredMonthlyFigures): Money | null {
  if (figures.monthsLeft === null) return null

  const remaining = goalRemaining(figures)
  if (remaining.isZero()) return Money.zero(figures.target.currency)
  if (figures.monthsLeft <= 0) return remaining

  return remaining.dividedBy(figures.monthsLeft).ceilToMinor()
}

export interface MonthsToFinishFigures extends GoalTargetFigures {
  /** What the goal receives each month — its plan line, or what the user intends to put in. */
  readonly monthly: Money
}

/**
 * How many months of `monthly` it takes to finish the goal.
 *
 * This is the other direction of `requiredMonthly`, and it is what a goal with no target date can
 * still say for itself: "at ₺2,000 a month, funded in 14 months". Null when nothing is going in,
 * because then it never finishes; zero once it is already funded.
 */
export function monthsToFinish(figures: MonthsToFinishFigures): number | null {
  const remaining = goalRemaining(figures)
  if (remaining.isZero()) return 0
  if (!figures.monthly.isPositive()) return null
  // A whole count of months, so it parses as an integer and never through a float.
  return Number.parseInt(remaining.amount.dividedBy(figures.monthly.amount).ceil().toFixed(0), 10)
}

/* ---------------------------------------------------------- emergency fund */

/** The months of cover an emergency fund can be set to (§9, flow F7). */
export const EMERGENCY_FUND_MONTHS = [1, 3, 6] as const

export type EmergencyFundMonths = (typeof EMERGENCY_FUND_MONTHS)[number]

export function isEmergencyFundMonths(value: unknown): value is EmergencyFundMonths {
  return typeof value === 'number' && (EMERGENCY_FUND_MONTHS as readonly number[]).includes(value)
}

export interface EmergencyFundFigures {
  readonly months: number
  /**
   * One month of essential spending: the current plan's essential **and debt** lines (§9). Debt
   * counts because a loan installment does not pause when an income does.
   */
  readonly essentialMonthly: Money
}

/**
 * `months × essential monthly expenses` (§9).
 *
 * Derived on every read rather than frozen when the goal was created, so the target follows the
 * household's real cost of living: raise the rent line and the fund you need grows with it. That
 * is why an emergency fund stores no target of its own.
 */
export function emergencyFundTarget(figures: EmergencyFundFigures): Money {
  return figures.essentialMonthly.times(figures.months).roundToMinor()
}

export interface EmergencyFundCoverage {
  readonly saved: Money
  readonly essentialMonthly: Money
}

/**
 * How many months of essentials the fund covers: `saved ÷ essential monthly` (§16).
 *
 * The mockup's figure: ₺82,000 against ₺24,800 of essentials is **3.3 months**. Null when there
 * are no essentials to divide by — a plan with nothing essential in it cannot say how long its
 * savings would last, and a made-up infinity would be worse than a dash.
 */
export function emergencyFundCoverage(figures: EmergencyFundCoverage): Decimal | null {
  if (figures.essentialMonthly.isZero()) return null
  return figures.saved.amount.dividedBy(figures.essentialMonthly.amount)
}

/* --------------------------------------------------------------- the status */

/** The four states a goal card can be in (§16); `GoalProgress` colours the ring from it. */
export const GOAL_STATUSES = ['funded', 'onTrack', 'behind', 'neutral'] as const

export type GoalStatus = (typeof GOAL_STATUSES)[number]

export interface GoalStatusFigures extends GoalTargetFigures {
  /** What this period's plan line gives the goal, or undefined when it has no line. */
  readonly plannedMonthly?: Money | undefined
  /** `requiredMonthly`: null when the goal has no target date. */
  readonly requiredMonthly?: Money | null | undefined
}

/**
 * Where a goal stands (§16).
 *
 * `funded` once it holds what it was for. Otherwise the judgement is only possible when there is
 * something to compare: a goal with a date needs a certain amount each month, and a goal with a
 * plan line is getting one — `behind` when the line is smaller than the goal needs, `onTrack`
 * when it keeps up. Without both, the honest answer is `neutral`: a goal with no date and no line
 * is not failing, it is simply not being measured.
 */
export function goalStatus(figures: GoalStatusFigures): GoalStatus {
  if (isGoalFunded(figures)) return 'funded'

  const required = figures.requiredMonthly
  const planned = figures.plannedMonthly
  if (required === null || required === undefined || planned === undefined) return 'neutral'

  return planned.lessThan(required) ? 'behind' : 'onTrack'
}

/* --------------------------------------------------------- over-earmarking */

export interface EarmarkFigures {
  /** What this account's goals have earmarked between them. */
  readonly earmarked: Money
  /** What the account actually holds, from the ledger. */
  readonly accountBalance: Money
}

/**
 * How much more is earmarked than the "kept in" account holds (§9).
 *
 * The warning this feeds — *"₺X more is earmarked than this account holds"* — is a warning and
 * never a refusal. Earmarks are the user's own bookkeeping, and the app has no business telling
 * someone they may not plan for something; it only has to be honest that the money is not there
 * yet. Zero means every earmark on the account is backed.
 */
export function overEarmarked(figures: EarmarkFigures): Money {
  const excess = figures.earmarked.minus(figures.accountBalance).roundToMinor()
  return excess.isPositive() ? excess : Money.zero(figures.earmarked.currency)
}

/* ------------------------------------------------------------ contributing */

/** Why a contribution was refused. The API turns each of these into its own message. */
export const CONTRIBUTION_REFUSALS = ['notPositive', 'moreThanSaved', 'goalArchived'] as const

export type ContributionRefusal = (typeof CONTRIBUTION_REFUSALS)[number]

export type ContributionCheck = { ok: true } | { ok: false; refusal: ContributionRefusal }

export interface ContributionFigures {
  /** Positive earmarks money for the goal; negative releases it back. Never zero. */
  readonly amount: Money
  /** What the goal holds now, so a release cannot take out more than went in. */
  readonly saved: Money
  readonly archived?: boolean | undefined
}

/**
 * Whether a contribution can be recorded (§9).
 *
 * A release is capped at what the goal holds: taking out more would leave the goal holding a
 * negative amount, which is not a thing money does — the goal would be claiming to owe the pool.
 * Over-*funding* in the other direction is deliberately allowed (a goal may hold more than its
 * target), and an archived goal takes nothing new: un-archive it first.
 */
export function checkContribution(figures: ContributionFigures): ContributionCheck {
  if (figures.amount.isZero()) return { ok: false, refusal: 'notPositive' }
  if (figures.archived) return { ok: false, refusal: 'goalArchived' }

  if (figures.amount.isNegative() && figures.amount.negate().greaterThan(figures.saved)) {
    return { ok: false, refusal: 'moreThanSaved' }
  }
  return { ok: true }
}

/** What a "release everything" button offers: the whole balance, never below zero. */
export function releasableAmount(saved: Money): Money {
  return saved.isPositive() ? saved : Money.zero(saved.currency)
}
