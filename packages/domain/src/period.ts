import {
  addDays,
  addMonths,
  diffInDays,
  fromParts,
  isBefore,
  toParts,
  type PlainDate,
} from './dates.ts'

/**
 * A plan period: one budget month as the half-open range `[start, end)` (decision D3, ADR 0003).
 * `end` is the first day of the next period.
 */
export interface Period {
  readonly start: PlainDate
  readonly end: PlainDate
}

export const MIN_PERIOD_START_DAY = 1
export const MAX_PERIOD_START_DAY = 28
export const DEFAULT_PERIOD_START_DAY = 1

export function isPeriodStartDay(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= MIN_PERIOD_START_DAY &&
    (value as number) <= MAX_PERIOD_START_DAY
  )
}

function assertStartDay(startDay: number) {
  if (!isPeriodStartDay(startDay)) {
    throw new RangeError(
      `Period start day must be an integer from ${MIN_PERIOD_START_DAY} to ${MAX_PERIOD_START_DAY}`,
    )
  }
}

/** The first date on or after `date` whose day of month is `startDay`. */
function startDayOnOrAfter(date: PlainDate, startDay: number): PlainDate {
  const { year, month, day } = toParts(date)
  const candidate = fromParts(year, month, startDay)
  return day <= startDay ? candidate : addMonths(candidate, 1)
}

/**
 * The period that contains `date`.
 * Start day 1: 2026-10-06 → [2026-10-01, 2026-11-01).
 * Start day 15: 2026-10-06 → [2026-09-15, 2026-10-15).
 */
export function periodContaining(date: PlainDate, startDay: number): Period {
  assertStartDay(startDay)
  const { year, month, day } = toParts(date)
  const thisMonthStart = fromParts(year, month, startDay)
  const start = day >= startDay ? thisMonthStart : addMonths(thisMonthStart, -1)
  return { start, end: addMonths(start, 1) }
}

/**
 * The period right after `period`. It always starts at `period.end`, so periods never overlap
 * or leave gaps, and ends on the next `startDay`. If the start day changed, this transition
 * period is shorter than a month (Phase 6 decides how the UI presents that).
 */
export function nextPeriod(period: Period, startDay: number): Period {
  assertStartDay(startDay)
  return { start: period.end, end: startDayOnOrAfter(addDays(period.end, 1), startDay) }
}

/** The period right before `period`. It always ends at `period.start`. */
export function previousPeriod(period: Period, startDay: number): Period {
  assertStartDay(startDay)
  return { start: periodContaining(addDays(period.start, -1), startDay).start, end: period.start }
}

export function periodLength(period: Period): number {
  return diffInDays(period.end, period.start)
}

export function lastDayOf(period: Period): PlainDate {
  return addDays(period.end, -1)
}

export function isInPeriod(period: Period, date: PlainDate): boolean {
  return !isBefore(date, period.start) && isBefore(date, period.end)
}

/** Days from `today` to the end of the period, counting today. 0 after the period, full length before it. */
export function daysLeftIncluding(period: Period, today: PlainDate): number {
  if (isBefore(today, period.start)) return periodLength(period)
  if (!isBefore(today, period.end)) return 0
  return diffInDays(period.end, today)
}

/** Completed days of the period before `today`. Always `periodLength − daysLeftIncluding`. */
export function daysElapsed(period: Period, today: PlainDate): number {
  return periodLength(period) - daysLeftIncluding(period, today)
}
