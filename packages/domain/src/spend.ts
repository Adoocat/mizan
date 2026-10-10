/**
 * Available to spend, and the one number the app exists to answer: how much can be spent today
 * without hurting the bills, the goals or the investments (PLAN §10, §16).
 *
 * Everything here is pure. The service hands in the period's figures — what the pool has, what
 * has been spent against it, what other lines have overspent, and how far the plan is
 * over-allocated — and these functions turn them into the daily allowance. The web app calls the
 * same functions to preview what an expense would do before it is saved, so the preview and the
 * saved answer agree by construction.
 */
import type { PlainDate } from './dates.ts'
import { Money } from './money.ts'
import { daysLeftIncluding, type Period } from './period.ts'
import { planLineAvailable, planLineOverspend, type PlanLineFigures } from './plan.ts'

/* ----------------------------------------------------- available to spend */

export interface AvailableToSpendFigures {
  /** `Available(pool)`: the pool's budget, carry-in and moves included, minus pooled spending. */
  readonly poolAvailable: Money
  /**
   * The sum of every other line's overspend that no plan move has covered (decision D4).
   *
   * A cover does not appear here: it raises the overspent line's budget, so the overspend is
   * gone from this figure, and lowers the source line's — which is the whole point of recording
   * where the money came from.
   */
  readonly uncoveredOverspend: Money
  /**
   * `Unassigned (U)`. Only a negative value matters here: a plan that promises more than the
   * month will bring cannot also offer the difference as spending money. Money still waiting to
   * be assigned is *not* spendable either — it has no job yet, and giving it one is the user's
   * decision, not the app's.
   */
  readonly unassigned: Money
}

/**
 * `ATS = Available(pool) − Σ uncovered overspend + min(0, U)` (§10, decision D4).
 *
 * Conservative by decision: an overspend reduces this the moment it happens, rather than once
 * the user acknowledges it. The number may therefore fall without the user doing anything, which
 * is why every screen that shows it also shows how it was reached — but it will never offer money
 * that is already spent.
 *
 * Never negative: a plan that is deeper in the red than the pool can absorb shows nothing to
 * spend, not a debt to spend.
 */
export function availableToSpend(figures: AvailableToSpendFigures): Money {
  const shortfall = figures.unassigned.isNegative() ? figures.unassigned.negate() : null
  const available = figures.poolAvailable
    .minus(figures.uncoveredOverspend)
    .minus(shortfall ?? Money.zero(figures.poolAvailable.currency))
    .roundToMinor()

  return available.isNegative() ? Money.zero(available.currency) : available
}

/** The deduction `min(0, U)` makes, as a positive amount — what an explanation has to show. */
export function overAllocatedBy(unassignedAmount: Money): Money {
  return unassignedAmount.isNegative()
    ? unassignedAmount.negate()
    : Money.zero(unassignedAmount.currency)
}

/** `Σ Overspend(L)` over the lines the pool is not already answering for (§10). */
export function uncoveredOverspend(lines: readonly PlanLineFigures[], currency: string): Money {
  return Money.sum(lines.map(planLineOverspend), currency).roundToMinor()
}

/* -------------------------------------------------- safe to spend today */

export interface SafeToSpendFigures {
  /**
   * Available to spend as it stood at the start of today — every movement dated today left out.
   *
   * The allowance is set once a day and then spent down, rather than shrinking with each expense
   * as the day goes on. Anything left unspent is simply part of tomorrow's figure, because the
   * division runs again on a smaller number of days (§10).
   */
  readonly availableAtStartOfToday: Money
  /** Available to spend right now, with everything recorded today included. */
  readonly availableNow: Money
  readonly daysLeft: number
}

export interface DailyAllowance {
  /** `max(0, ATS excluding today) ÷ days left including today`, rounded down (§10). */
  readonly safeToday: Money
  /** What today has taken off the figure so far. Zero on a day that only brought money in. */
  readonly spentToday: Money
  /** `safe today − today's spending`. Negative once today has gone past its allowance. */
  readonly remainingToday: Money
}

/**
 * The daily allowance and what is left of it (§10, and the mockup's hero panel).
 *
 * The example from the design: ₺9,000 in the pool, ₺6,000 spent before today, ten days to go —
 * ₺300 a day. Spend ₺85 and ₺215 is left for today.
 *
 * `spentToday` is the difference between the two figures rather than a sum of today's expenses,
 * so it counts everything today did: pooled spending, an overspend created today, and a transfer
 * that left the budget. A day that brought money in shows nothing spent and more left.
 */
export function dailyAllowance(figures: SafeToSpendFigures): DailyAllowance {
  const currency = figures.availableNow.currency
  const zero = Money.zero(currency)
  const start = figures.availableAtStartOfToday

  const safeToday =
    figures.daysLeft <= 0 || !start.isPositive()
      ? zero
      : start.dividedBy(figures.daysLeft).floorToMinor()

  const effect = start.minus(figures.availableNow).roundToMinor()

  return {
    safeToday,
    spentToday: effect.isPositive() ? effect : zero,
    remainingToday: safeToday.minus(effect).roundToMinor(),
  }
}

/** Days of the period left to spend over, today included (§10). Zero once it is over. */
export const daysLeftToSpend = (period: Period, today: PlainDate): number =>
  daysLeftIncluding(period, today)

/* ------------------------------------------------------------- covering */

/** Why a cover was refused. The API turns each of these into its own message. */
export const COVER_REFUSALS = [
  'nothingToCover',
  'sameLine',
  'notPositive',
  'moreThanOverspend',
  'sourceTooSmall',
] as const

export type CoverRefusal = (typeof COVER_REFUSALS)[number]

export type CoverCheck = { ok: true } | { ok: false; refusal: CoverRefusal }

export interface CoverFigures {
  /** The line the money comes from. */
  readonly source: PlanLineFigures
  /** The overspent line it goes to. */
  readonly target: PlanLineFigures
  readonly amount: Money
  /** Whether both sides are the same line, which the caller knows and the figures do not. */
  readonly sameLine?: boolean | undefined
}

/**
 * Whether a cover can be recorded (§10: "Cover creates a PlanMove recording where the money came
 * from").
 *
 * A cover moves money that exists: the source must actually have the amount spare, or the plan
 * would claim to have solved an overspend with money that is itself already spent. It also has
 * to be covering something — an amount larger than the overspend would leave the target with
 * money it was never allocated.
 */
export function checkCover(figures: CoverFigures): CoverCheck {
  if (!figures.amount.isPositive()) return { ok: false, refusal: 'notPositive' }
  if (figures.sameLine) return { ok: false, refusal: 'sameLine' }

  const overspend = planLineOverspend(figures.target)
  if (overspend.isZero()) return { ok: false, refusal: 'nothingToCover' }
  // More than the overspend would leave the target holding money it was never allocated.
  if (figures.amount.greaterThan(overspend)) return { ok: false, refusal: 'moreThanOverspend' }

  const spare = planLineAvailable(figures.source)
  if (!spare.greaterThanOrEqual(figures.amount)) return { ok: false, refusal: 'sourceTooSmall' }

  return { ok: true }
}

/** The amount a cover should default to: the whole overspend, as far as the source can go. */
export function suggestedCover(figures: Omit<CoverFigures, 'amount'>): Money {
  const overspend = planLineOverspend(figures.target)
  const spare = planLineAvailable(figures.source)
  if (!spare.isPositive()) return Money.zero(overspend.currency)
  return Money.min(overspend, spare).roundToMinor()
}
