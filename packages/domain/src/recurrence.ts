/**
 * Recurring money: the rules that say a payment comes round again, and the occurrences they
 * expand into (PLAN §11).
 *
 * **Occurrences are virtual.** Nothing here writes anything, and no future transaction is ever
 * stored: a rule is a small description of a series, and `expandRecurrence` turns it into the
 * dates in a window on demand. That is what keeps a rule editable — change the rent and every
 * unposted occurrence changes with it — and what keeps the ledger honest, because a transaction
 * exists only once the money actually moved.
 *
 * Two dates matter and they are not the same one. The **original date** is the series date: the
 * 1st of the month, come what may. It is the occurrence's identity, what an exception keys on and
 * what a posted transaction records, so moving an occurrence can never turn it into a different
 * one. The **due date** is when it is actually expected — the original date after the weekend
 * policy, and after any override the user wrote for that one occurrence. The user only ever sees
 * the due date; the database only ever keys on the original one.
 *
 * Nothing here reads a clock. `today` is passed in, which is what makes "overdue" testable.
 */
import {
  addDays,
  compareDates,
  dayOfWeek,
  daysInMonth,
  diffInDays,
  fromParts,
  isAfter,
  isBefore,
  toParts,
  type PlainDate,
} from './dates.ts'
import { Money } from './money.ts'

/* -------------------------------------------------------------------- types */

/**
 * How often a rule comes round (§11).
 *
 * `monthly` carries the weight of the MVP — rent, salary, subscriptions, loan installments — and
 * is the only frequency with a day of its own (`byMonthDay`). The other three are anchored by
 * `startDate`: a weekly rule keeps its weekday, a yearly one its month and day.
 */
export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

export class UnknownRecurrenceFrequencyError extends Error {
  override name = 'UnknownRecurrenceFrequencyError'
}

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return typeof value === 'string' && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
}

export function recurrenceFrequency(value: string): RecurrenceFrequency {
  if (!isRecurrenceFrequency(value)) {
    throw new UnknownRecurrenceFrequencyError(`Unknown recurrence frequency: ${value}`)
  }
  return value
}

/**
 * What happens when a due date lands on a Saturday or Sunday (§11).
 *
 * Banks in Türkiye do not move money at the weekend, so a rent payment due on the 1st is really
 * paid on the Friday before or the Monday after, and which one it is depends on the payment. A
 * direct debit is taken on the next business day; a transfer the user makes themselves usually
 * goes out before the weekend. Turkish public holidays are v2 — they need a calendar that has to
 * be maintained, and getting the weekend right covers most of the drift.
 */
export const WEEKEND_POLICIES = ['none', 'previous_business_day', 'next_business_day'] as const

export type WeekendPolicy = (typeof WEEKEND_POLICIES)[number]

export function isWeekendPolicy(value: unknown): value is WeekendPolicy {
  return typeof value === 'string' && (WEEKEND_POLICIES as readonly string[]).includes(value)
}

/**
 * What confirming an occurrence records (§11).
 *
 * The kind decides what a confirm writes and what `goalId` means: on an `expense` or `income` the
 * goal is what the money is **funded from** — a sinking fund paying its bill — and on a
 * `transfer` it is what the money is **earmarked for**, so the confirm records the transfer and
 * the goal contribution together (§9, ADR 0013). Both are things the ledger already allows; the
 * rule only says which one is meant.
 */
export const RECURRING_RULE_KINDS = ['expense', 'income', 'transfer'] as const

export type RecurringRuleKind = (typeof RECURRING_RULE_KINDS)[number]

export class UnknownRecurringRuleKindError extends Error {
  override name = 'UnknownRecurringRuleKindError'
}

export function isRecurringRuleKind(value: unknown): value is RecurringRuleKind {
  return typeof value === 'string' && (RECURRING_RULE_KINDS as readonly string[]).includes(value)
}

export function recurringRuleKind(value: string): RecurringRuleKind {
  if (!isRecurringRuleKind(value)) {
    throw new UnknownRecurringRuleKindError(`Unknown recurring rule kind: ${value}`)
  }
  return value
}

/**
 * Whether the amount is known in advance (§11).
 *
 * A subscription is `fixed`: ₺222 every month until Netflix says otherwise. An electricity bill
 * is `estimated`: the plan needs a figure to work with, the user enters the real one when it
 * arrives, and the UI shows it with a "~" so nobody mistakes the estimate for a bill. Only a
 * fixed amount may auto-post — posting a guess would put a wrong number in the ledger without
 * anyone looking at it.
 */
export const AMOUNT_MODES = ['fixed', 'estimated'] as const

export type AmountMode = (typeof AMOUNT_MODES)[number]

export function isAmountMode(value: unknown): value is AmountMode {
  return typeof value === 'string' && (AMOUNT_MODES as readonly string[]).includes(value)
}

/**
 * Whether a rule is currently producing occurrences.
 *
 * There is deliberately no `ended` status. A rule ends through `endDate` or `maxCount`, and both
 * are facts the series already carries — a third column saying the same thing is exactly the kind
 * of state that drifts out of step with what the dates actually say (the same reason `goals` has
 * no stored status, ADR 0013). `isFinished` derives it.
 */
export const RECURRING_RULE_STATUSES = ['active', 'paused'] as const

export type RecurringRuleStatus = (typeof RECURRING_RULE_STATUSES)[number]

export function isRecurringRuleStatus(value: unknown): value is RecurringRuleStatus {
  return typeof value === 'string' && (RECURRING_RULE_STATUSES as readonly string[]).includes(value)
}

/**
 * Where an occurrence stands (§11): `upcoming` → `due` → `overdue`, or settled as `posted` or
 * `skipped`.
 *
 * `overdue` is the one that earns its keep: a payment whose day has passed with nothing recorded
 * is either a bill the user forgot or money that left without being entered, and both belong on
 * the Needs-attention list rather than quietly disappearing.
 */
export const OCCURRENCE_STATES = ['upcoming', 'due', 'overdue', 'posted', 'skipped'] as const

export type OccurrenceState = (typeof OCCURRENCE_STATES)[number]

export function isOccurrenceState(value: unknown): value is OccurrenceState {
  return typeof value === 'string' && (OCCURRENCE_STATES as readonly string[]).includes(value)
}

/**
 * What a single-occurrence edit did (§11, "only this").
 *
 * `skip` is the month the gym was closed; `override` is the month the rent was ₺500 higher or
 * the bill was paid three days late. Posting is **not** here: a posted occurrence is a
 * transaction carrying the rule and the original date, so the ledger stays the only place that
 * knows money moved, and deleting that transaction hands the occurrence back as due.
 */
export const RECURRENCE_EXCEPTION_ACTIONS = ['skip', 'override'] as const

export type RecurrenceExceptionAction = (typeof RECURRENCE_EXCEPTION_ACTIONS)[number]

export function isRecurrenceExceptionAction(value: unknown): value is RecurrenceExceptionAction {
  return (
    typeof value === 'string' && (RECURRENCE_EXCEPTION_ACTIONS as readonly string[]).includes(value)
  )
}

/* ----------------------------------------------------------------- schedule */

/**
 * The timing half of a rule: everything needed to say which dates it falls on.
 *
 * Separate from the amount and the accounts on purpose — the date arithmetic is the part with all
 * the edge cases, and keeping it to a value with no money in it is what lets the property tests
 * hammer it.
 */
export interface RecurrenceSchedule {
  readonly freq: RecurrenceFrequency
  /** Every `interval` periods: 1 is every month, 3 is quarterly, 2 is every other week. */
  readonly interval: number
  /** The first occurrence. Also the anchor: a weekly rule's weekday, a yearly rule's month. */
  readonly startDate: PlainDate
  /**
   * Which day of the month a monthly rule falls on, 1–31. Null takes the day from `startDate`.
   *
   * 29, 30 and 31 mean "that day, or the last day of a shorter month" (§11), and the clamp is
   * applied to **each** month from the original day rather than carried forward: day 31 is
   * 31 January, 28 February, 31 March. Stepping from the clamped date instead would drift to the
   * 28th of every month after the first February.
   */
  readonly byMonthDay: number | null
  readonly weekendPolicy: WeekendPolicy
  /** The last date an occurrence may fall on, inclusive. Null runs forever. */
  readonly endDate: PlainDate | null
  /** At most this many occurrences from the start. Null is unlimited. */
  readonly maxCount: number | null
  readonly status: RecurringRuleStatus
  /**
   * The suppression window while `status` is `paused`: `[pausedFrom, pausedUntil)`.
   *
   * A pause has a start because "don't ask me about the gym for three months" must not also erase
   * the two payments that were already overdue when the user paused it — those still happened, or
   * still need resolving. `pausedUntil` null pauses indefinitely.
   */
  readonly pausedFrom: PlainDate | null
  readonly pausedUntil: PlainDate | null
}

/** A rule as the expansion sees it: its schedule plus the amount each occurrence carries. */
export interface RecurrenceRule extends RecurrenceSchedule {
  readonly amount: Money
  readonly amountMode: AmountMode
}

/** One single-occurrence edit, keyed by the original (series) date (§11). */
export interface RecurrenceException {
  readonly originalDate: PlainDate
  readonly action: RecurrenceExceptionAction
  /** Where an override moved the occurrence to. Null leaves the date alone. */
  readonly overrideDate: PlainDate | null
  /** What an override replaced the amount with. Null leaves the rule's amount. */
  readonly overrideAmount: Money | null
}

export const MIN_RECURRENCE_INTERVAL = 1
export const MAX_RECURRENCE_INTERVAL = 365
export const MIN_MONTH_DAY = 1
export const MAX_MONTH_DAY = 31
export const MAX_RECURRENCE_COUNT = 1000

/** The last year `PlainDate` can express, which is what bounds a counted series. */
const MAX_YEAR = 9999

/** Roughly how many years `steps` periods of this frequency cover; used only to reject absurdity. */
function yearsSpanned(freq: RecurrenceFrequency, steps: number): number {
  switch (freq) {
    case 'daily':
      return steps / 365
    case 'weekly':
      return (steps * 7) / 365
    case 'monthly':
      return steps / 12
    case 'yearly':
      return steps
  }
}

function assertSchedule(schedule: RecurrenceSchedule): void {
  if (
    !Number.isInteger(schedule.interval) ||
    schedule.interval < MIN_RECURRENCE_INTERVAL ||
    schedule.interval > MAX_RECURRENCE_INTERVAL
  ) {
    throw new RangeError(
      `interval must be a whole number from ${MIN_RECURRENCE_INTERVAL} to ${MAX_RECURRENCE_INTERVAL}`,
    )
  }
  if (schedule.byMonthDay !== null) {
    if (
      !Number.isInteger(schedule.byMonthDay) ||
      schedule.byMonthDay < MIN_MONTH_DAY ||
      schedule.byMonthDay > MAX_MONTH_DAY
    ) {
      throw new RangeError(
        `byMonthDay must be a whole number from ${MIN_MONTH_DAY} to ${MAX_MONTH_DAY}`,
      )
    }
  }
  if (schedule.endDate !== null && isBefore(schedule.endDate, schedule.startDate)) {
    throw new RangeError('endDate cannot be before startDate')
  }
  if (schedule.maxCount === null) return

  if (
    !Number.isInteger(schedule.maxCount) ||
    schedule.maxCount < 1 ||
    schedule.maxCount > MAX_RECURRENCE_COUNT
  ) {
    throw new RangeError(`maxCount must be a whole number from 1 to ${MAX_RECURRENCE_COUNT}`)
  }
  /*
   * A counted series has to end on a date the calendar can express: `isFinished` and
   * `lastSeriesDate` both ask for its last occurrence, and "every year for 1,000 years" would
   * otherwise fail there rather than where the rule was written.
   */
  const span = yearsSpanned(schedule.freq, (schedule.maxCount - 1) * schedule.interval)
  if (toParts(schedule.startDate).year + span > MAX_YEAR) {
    throw new RangeError('that many occurrences would run past the end of the calendar')
  }
}

/* ----------------------------------------------------------- the series dates */

/** The day of the month a monthly rule aims at: its own, or the one its start date implies. */
function monthDayOf(schedule: RecurrenceSchedule): number {
  return schedule.byMonthDay ?? toParts(schedule.startDate).day
}

/**
 * The `index`-th date of the series, counting the start date as 0.
 *
 * Strictly increasing in `index` for every frequency, which is what lets `seriesIndexOf` find a
 * date's position by arithmetic and then prove it by equality.
 */
export function nthSeriesDate(schedule: RecurrenceSchedule, index: number): PlainDate {
  assertSchedule(schedule)
  if (!Number.isInteger(index) || index < 0)
    throw new RangeError('index must be a whole number ≥ 0')

  const step = index * schedule.interval

  switch (schedule.freq) {
    case 'daily':
      return addDays(schedule.startDate, step)
    case 'weekly':
      return addDays(schedule.startDate, step * 7)
    case 'monthly': {
      const { year, month } = toParts(schedule.startDate)
      const monthIndex = year * 12 + (month - 1) + step
      const targetYear = Math.floor(monthIndex / 12)
      const targetMonth = monthIndex - targetYear * 12 + 1
      // Clamped from the rule's own day every time, so day 31 never drifts to the 28th.
      return fromParts(
        targetYear,
        targetMonth,
        Math.min(monthDayOf(schedule), daysInMonth(targetYear, targetMonth)),
      )
    }
    case 'yearly': {
      const { year, month, day } = toParts(schedule.startDate)
      const targetYear = year + step
      // 29 February falls on the 28th in a common year, by the same clamp as the months.
      return fromParts(targetYear, month, Math.min(day, daysInMonth(targetYear, month)))
    }
  }
}

/** How many whole months separate two dates, ignoring their days. */
function monthsBetween(from: PlainDate, to: PlainDate): number {
  const a = toParts(from)
  const b = toParts(to)
  return (b.year - a.year) * 12 + (b.month - a.month)
}

/**
 * The lowest index whose date is on or after `date`, before any limit is applied.
 *
 * The division gets within one step for every frequency, and the two short corrections below make
 * it exact: the month and year arithmetic can be off by one when the clamp moves a date across a
 * month end.
 */
function firstIndexOnOrAfter(schedule: RecurrenceSchedule, date: PlainDate): number {
  if (!isAfter(date, schedule.startDate)) return 0

  const estimate = (() => {
    switch (schedule.freq) {
      case 'daily':
        return Math.ceil(diffInDays(date, schedule.startDate) / schedule.interval)
      case 'weekly':
        return Math.ceil(diffInDays(date, schedule.startDate) / (schedule.interval * 7))
      case 'monthly':
        return Math.ceil(monthsBetween(schedule.startDate, date) / schedule.interval)
      case 'yearly':
        return Math.ceil(
          (toParts(date).year - toParts(schedule.startDate).year) / schedule.interval,
        )
    }
  })()

  let index = Math.max(0, estimate)
  while (index > 0 && !isBefore(nthSeriesDate(schedule, index - 1), date)) index -= 1
  while (isBefore(nthSeriesDate(schedule, index), date)) index += 1
  return index
}

/**
 * Where `date` sits in the series, or null when it is not a date of this series at all.
 *
 * This is what makes `/recurring/:id/occurrences/:date/confirm` safe: the date comes from a URL,
 * and an occurrence that the rule never produces must be refused rather than invented.
 */
export function seriesIndexOf(schedule: RecurrenceSchedule, date: PlainDate): number | null {
  assertSchedule(schedule)
  if (isBefore(date, schedule.startDate)) return null

  const index = firstIndexOnOrAfter(schedule, date)
  if (nthSeriesDate(schedule, index) !== date) return null
  if (schedule.maxCount !== null && index >= schedule.maxCount) return null
  if (schedule.endDate !== null && isAfter(date, schedule.endDate)) return null
  return index
}

export function isSeriesDate(schedule: RecurrenceSchedule, date: PlainDate): boolean {
  return seriesIndexOf(schedule, date) !== null
}

/* ------------------------------------------------------------ business days */

/** Saturday or Sunday, by the ISO numbering `dayOfWeek` returns (1 = Monday). */
export function isWeekend(date: PlainDate): boolean {
  return dayOfWeek(date) >= 6
}

export function previousBusinessDay(date: PlainDate): PlainDate {
  let moved = date
  while (isWeekend(moved)) moved = addDays(moved, -1)
  return moved
}

export function nextBusinessDay(date: PlainDate): PlainDate {
  let moved = date
  while (isWeekend(moved)) moved = addDays(moved, 1)
  return moved
}

/** The original date moved by the rule's weekend policy. Weekdays are never moved. */
export function applyWeekendPolicy(date: PlainDate, policy: WeekendPolicy): PlainDate {
  if (policy === 'none' || !isWeekend(date)) return date
  return policy === 'previous_business_day' ? previousBusinessDay(date) : nextBusinessDay(date)
}

/** How far the weekend policy can move a date: Sunday back to Friday, or Saturday on to Monday. */
const WEEKEND_SLACK_DAYS = 2

/* ---------------------------------------------------------------- the pause */

/**
 * Whether the rule's pause suppresses the occurrence on `date`.
 *
 * The window is half-open, `[pausedFrom, pausedUntil)`, so resuming on the 1st means the 1st is
 * back. A paused rule with no `pausedFrom` suppresses everything, which is what a pause with no
 * recorded start can honestly be taken to mean.
 */
export function isSuppressedByPause(schedule: RecurrenceSchedule, date: PlainDate): boolean {
  if (schedule.status !== 'paused') return false
  if (schedule.pausedFrom !== null && isBefore(date, schedule.pausedFrom)) return false
  if (schedule.pausedUntil !== null && !isBefore(date, schedule.pausedUntil)) return false
  return true
}

/**
 * Whether the series has anything left on or after `today`.
 *
 * Derived from `endDate` and `maxCount` rather than stored, so a rule can never claim to be
 * running after its last occurrence has passed. A pause is not an end: a paused rule still has a
 * series, and the UI says "paused" rather than "finished".
 */
export function isFinished(schedule: RecurrenceSchedule, today: PlainDate): boolean {
  assertSchedule(schedule)
  if (schedule.endDate !== null && isBefore(schedule.endDate, today)) return true
  if (schedule.maxCount !== null) {
    return isBefore(nthSeriesDate(schedule, schedule.maxCount - 1), today)
  }
  return false
}

/** The series' last date, when it has one: whichever of `endDate` and `maxCount` comes first. */
export function lastSeriesDate(schedule: RecurrenceSchedule): PlainDate | null {
  assertSchedule(schedule)
  const byCount = schedule.maxCount === null ? null : nthSeriesDate(schedule, schedule.maxCount - 1)
  if (schedule.endDate === null) return byCount
  if (byCount === null) return schedule.endDate
  return isBefore(byCount, schedule.endDate) ? byCount : schedule.endDate
}

/* --------------------------------------------------------------- expansion */

/**
 * One occurrence of a rule, as every screen and every total sees it (§11).
 *
 * `amount` already has any override applied, so callers never have to decide which figure wins;
 * `estimated` says whether to show it with a "~".
 */
export interface Occurrence {
  /** The series date: this occurrence's identity, and what the database keys on. */
  readonly originalDate: PlainDate
  /** When the money is expected: the weekend policy, then any override. */
  readonly dueDate: PlainDate
  /** Position in the series, counting the start date as 0. */
  readonly index: number
  readonly state: OccurrenceState
  readonly amount: Money
  /** True when the amount is a guess the user still has to confirm. */
  readonly estimated: boolean
  /** True when a single-occurrence edit moved this one's date or amount. */
  readonly overridden: boolean
}

export interface ExpandOptions {
  /** Window start, inclusive, matched against the **due** date. */
  readonly from: PlainDate
  /** Window end, inclusive. */
  readonly to: PlainDate
  /** What "today" is, which is what decides `upcoming` / `due` / `overdue`. */
  readonly today: PlainDate
  readonly exceptions?: readonly RecurrenceException[]
  /** Original dates that already have a transaction: they come back as `posted`. */
  readonly postedDates?: readonly PlainDate[]
  /**
   * Whether to include occurrences that are already settled — posted or skipped.
   *
   * Off by default, because almost every caller is asking "what still needs doing": the upcoming
   * list, the overdue count, the plan's committed total. The Calendar page turns it on to show a
   * month as it actually went.
   */
  readonly includeSettled?: boolean
}

/**
 * How many occurrences one call will return. A guard, not a product limit: a daily rule over a
 * year is 365, and anything past this is a window nobody asked a screen to render.
 */
export const MAX_EXPANDED_OCCURRENCES = 1000

/** The exceptions and posted dates, indexed once for the whole expansion. */
interface OccurrenceInputs {
  skipped: ReadonlySet<PlainDate>
  overrides: ReadonlyMap<PlainDate, RecurrenceException>
  posted: ReadonlySet<PlainDate>
}

function indexInputs(
  exceptions: readonly RecurrenceException[],
  postedDates: readonly PlainDate[],
): OccurrenceInputs {
  return {
    skipped: new Set(
      exceptions.filter((one) => one.action === 'skip').map((one) => one.originalDate),
    ),
    overrides: new Map(
      exceptions.filter((one) => one.action === 'override').map((one) => [one.originalDate, one]),
    ),
    posted: new Set(postedDates),
  }
}

/**
 * One occurrence, built from its series date. The single place the rules about what an occurrence
 * *is* are applied, so a list of them and a lookup of one can never describe it differently.
 *
 * Null when the rule's pause suppresses it: a paused occurrence is not a thing to act on.
 */
function buildOccurrence(
  rule: RecurrenceRule,
  index: number,
  originalDate: PlainDate,
  inputs: OccurrenceInputs,
  today: PlainDate,
): Occurrence | null {
  if (isSuppressedByPause(rule, originalDate)) return null

  const override = inputs.overrides.get(originalDate)
  const dueDate = override?.overrideDate ?? applyWeekendPolicy(originalDate, rule.weekendPolicy)

  return {
    originalDate,
    dueDate,
    index,
    state: stateOf({
      dueDate,
      today,
      posted: inputs.posted.has(originalDate),
      skipped: inputs.skipped.has(originalDate),
    }),
    amount: override?.overrideAmount ?? rule.amount,
    // An overridden amount is a figure the user typed, so it is no longer an estimate.
    estimated: rule.amountMode === 'estimated' && !override?.overrideAmount,
    overridden: override !== undefined,
  }
}

/**
 * The one occurrence on a given series date, or null when the rule has none there.
 *
 * What `/recurring/:id/occurrences/:date` resolves a URL with: the date is the occurrence's
 * identity, so this is a lookup rather than a search, and an override that moved the due date by
 * a year does not make it any harder to find.
 */
export function occurrenceAt(
  rule: RecurrenceRule,
  originalDate: PlainDate,
  options: {
    today: PlainDate
    exceptions?: readonly RecurrenceException[]
    postedDates?: readonly PlainDate[]
  },
): Occurrence | null {
  const index = seriesIndexOf(rule, originalDate)
  if (index === null) return null
  return buildOccurrence(
    rule,
    index,
    originalDate,
    indexInputs(options.exceptions ?? [], options.postedDates ?? []),
    options.today,
  )
}

/**
 * §11's `expand(rule, exceptions, from, to)`: the occurrences of one rule in a window.
 *
 * Ordered by due date, then by original date, so two occurrences that the weekend policy pushed
 * onto the same Monday keep the order they fall in. Filtering is by **due** date, because that is
 * the date the window means to the person reading it — an occurrence on Sunday the 1st that is
 * really paid on Friday the 30th belongs to the window containing the 30th.
 */
export function expandRecurrence(rule: RecurrenceRule, options: ExpandOptions): Occurrence[] {
  assertSchedule(rule)
  if (isBefore(options.to, options.from)) return []

  const inputs = indexInputs(options.exceptions ?? [], options.postedDates ?? [])

  /*
   * The weekend policy moves a date by at most two days, so the original dates that can land in
   * the window are those in the window padded by two. An override can move an occurrence
   * anywhere, so those are collected separately below rather than guessed at.
   */
  const searchFrom = addDays(options.from, -WEEKEND_SLACK_DAYS)
  const searchTo = addDays(options.to, WEEKEND_SLACK_DAYS)

  const indices = new Set<number>()
  for (
    let index = firstIndexOnOrAfter(rule, searchFrom);
    indices.size < MAX_EXPANDED_OCCURRENCES;
    index += 1
  ) {
    if (rule.maxCount !== null && index >= rule.maxCount) break
    const original = nthSeriesDate(rule, index)
    if (isAfter(original, searchTo)) break
    if (rule.endDate !== null && isAfter(original, rule.endDate)) break
    indices.add(index)
  }

  // An override may have pulled an occurrence into the window from outside the padded search.
  for (const exception of inputs.overrides.values()) {
    if (exception.overrideDate === null) continue
    if (
      isBefore(exception.overrideDate, options.from) ||
      isAfter(exception.overrideDate, options.to)
    ) {
      continue
    }
    const index = seriesIndexOf(rule, exception.originalDate)
    if (index !== null) indices.add(index)
  }

  const occurrences: Occurrence[] = []
  for (const index of [...indices].sort((a, b) => a - b)) {
    const occurrence = buildOccurrence(
      rule,
      index,
      nthSeriesDate(rule, index),
      inputs,
      options.today,
    )
    if (occurrence === null) continue
    if (isBefore(occurrence.dueDate, options.from) || isAfter(occurrence.dueDate, options.to)) {
      continue
    }
    if (
      !options.includeSettled &&
      (occurrence.state === 'posted' || occurrence.state === 'skipped')
    ) {
      continue
    }
    occurrences.push(occurrence)
  }

  return occurrences.sort(
    (a, b) => compareDates(a.dueDate, b.dueDate) || compareDates(a.originalDate, b.originalDate),
  )
}

/**
 * Where one occurrence stands.
 *
 * Settled beats timing: a payment that was posted is posted, whatever its date says. Among the
 * rest it is only the due date against today — the date the user was given, not the series date,
 * because an occurrence moved to Friday is not overdue on Sunday.
 */
export function stateOf(figures: {
  dueDate: PlainDate
  today: PlainDate
  posted: boolean
  skipped: boolean
}): OccurrenceState {
  if (figures.posted) return 'posted'
  if (figures.skipped) return 'skipped'
  if (isBefore(figures.dueDate, figures.today)) return 'overdue'
  return figures.dueDate === figures.today ? 'due' : 'upcoming'
}

/** A year is far enough to find the next occurrence of anything the MVP can describe. */
export const DEFAULT_NEXT_DUE_HORIZON_DAYS = 400

/**
 * The next date the rule expects money to move, on or after `today`, or null when it has nothing
 * left to give (§11).
 *
 * The **due** date, because that is the one the user is waiting for, and it goes through the same
 * expansion as every list and every total rather than walking the series itself: an override can
 * move an occurrence anywhere, including from behind today to ahead of it, and one path through
 * that logic is the only way "the next rent payment" and the Upcoming list agree.
 */
export function nextDueDate(
  rule: RecurrenceRule,
  options: {
    today: PlainDate
    exceptions?: readonly RecurrenceException[]
    postedDates?: readonly PlainDate[]
    horizonDays?: number
  },
): PlainDate | null {
  const horizonDays = options.horizonDays ?? DEFAULT_NEXT_DUE_HORIZON_DAYS
  const [next] = expandRecurrence(rule, {
    from: options.today,
    to: addDays(options.today, horizonDays),
    today: options.today,
    ...(options.exceptions === undefined ? {} : { exceptions: options.exceptions }),
    ...(options.postedDates === undefined ? {} : { postedDates: options.postedDates }),
  })
  return next?.dueDate ?? null
}

/* ------------------------------------------------------------- the totals */

/** Days in a year and months in a year, for turning one frequency into another. */
const DAYS_PER_YEAR = 365
const MONTHS_PER_YEAR = 12

/**
 * What the rule costs in a month, whatever its frequency: the "committed before spending" figure
 * the Upcoming page shows, and what makes a weekly cleaner comparable with annual insurance.
 *
 * An average, not a forecast: a ₺549 monthly bill is ₺549, a ₺6,000 annual premium is ₺500 a
 * month, and a weekly ₺400 is ₺1,738.10 — thirteen four-week months is not a thing, so the year
 * is divided rather than the month multiplied by four.
 */
export function monthlyEquivalent(
  rule: Pick<RecurrenceRule, 'freq' | 'interval' | 'amount'>,
): Money {
  switch (rule.freq) {
    case 'daily':
      return rule.amount
        .times(DAYS_PER_YEAR)
        .dividedBy(MONTHS_PER_YEAR * rule.interval)
        .roundToMinor()
    case 'weekly':
      return rule.amount
        .times(DAYS_PER_YEAR)
        .dividedBy(7 * MONTHS_PER_YEAR * rule.interval)
        .roundToMinor()
    case 'monthly':
      return rule.amount.dividedBy(rule.interval).roundToMinor()
    case 'yearly':
      return rule.amount.dividedBy(MONTHS_PER_YEAR * rule.interval).roundToMinor()
  }
}

export interface OnBudgetEffectFigures {
  readonly kind: RecurringRuleKind
  /** The occurrence's amount, as a magnitude: the sign comes from the kind, as in the ledger. */
  readonly amount: Money
  /** Whether the account the money leaves is on-budget. */
  readonly fromOnBudget: boolean
  /** Whether the account the money arrives in is on-budget. Only a transfer has one. */
  readonly toOnBudget?: boolean | undefined
}

/**
 * How much an occurrence will change what the on-budget accounts hold, signed.
 *
 * This is what "₺17,110 left in checking after these" is built from (§16). A transfer between two
 * on-budget accounts is **zero**: the money has not left the budget, it has only moved, and
 * counting it would make every savings transfer look like a loss. A transfer out to an off-budget
 * account is a real outflow, which is how an investment contribution shows up.
 */
export function onBudgetEffect(figures: OnBudgetEffectFigures): Money {
  const zero = Money.zero(figures.amount.currency)

  switch (figures.kind) {
    case 'expense':
      return figures.fromOnBudget ? figures.amount.negate() : zero
    case 'income':
      return figures.fromOnBudget ? figures.amount : zero
    case 'transfer': {
      const to = figures.toOnBudget ?? false
      if (figures.fromOnBudget === to) return zero
      return figures.fromOnBudget ? figures.amount.negate() : figures.amount
    }
  }
}

/* ------------------------------------------------------------ auto-posting */

/**
 * Whether a rule may post its own occurrences without anyone looking (§11).
 *
 * Opt-in and fixed-only, and the default is manual confirmation for a reason the plan states: a
 * direct debit that *failed* would still be posted, and the balance would drift silently away
 * from the bank's while every screen insisted it was right. An estimate would be worse again.
 */
export function canAutoPost(
  rule: Pick<RecurrenceRule, 'amountMode'> & { autoPost: boolean },
): boolean {
  return rule.autoPost && rule.amountMode === 'fixed'
}

/**
 * The occurrences an idempotent daily auto-post should write: due on or before `today`, not yet
 * posted, not skipped.
 *
 * Catching up rather than only posting today is deliberate — the worker may have been down, and
 * the point of auto-post is that the user does not have to notice.
 */
export function occurrencesToAutoPost(
  rule: RecurrenceRule & { autoPost: boolean },
  options: Omit<ExpandOptions, 'to' | 'includeSettled'>,
): Occurrence[] {
  if (!canAutoPost(rule)) return []
  return expandRecurrence(rule, { ...options, to: options.today }).filter(
    (occurrence) => occurrence.state === 'due' || occurrence.state === 'overdue',
  )
}
