/**
 * Plain calendar dates (`YYYY-MM-DD`) for business dates: transaction dates, due dates and
 * period bounds. No time, no time zone, no `Date` objects, so there are no off-by-one-day bugs.
 * Arithmetic uses integer day counts since 1970-01-01.
 */

declare const plainDateBrand: unique symbol
export type PlainDate = string & { readonly [plainDateBrand]: true }

export interface DateParts {
  year: number
  month: number
  day: number
}

export class InvalidDateError extends Error {
  override name = 'InvalidDateError'
}

const PLAIN_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

function isValidParts(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  )
}

export function isPlainDate(value: unknown): value is PlainDate {
  if (typeof value !== 'string') return false
  const match = PLAIN_DATE_PATTERN.exec(value)
  if (!match) return false
  return isValidParts(
    Number.parseInt(match[1]!, 10),
    Number.parseInt(match[2]!, 10),
    Number.parseInt(match[3]!, 10),
  )
}

/** Validates and brands a `YYYY-MM-DD` string. Throws for impossible dates like `2026-02-30`. */
export function plainDate(value: string): PlainDate {
  if (!isPlainDate(value)) throw new InvalidDateError(`Not a valid date: "${value}"`)
  return value
}

const pad = (value: number, width: number) => String(value).padStart(width, '0')

export function fromParts(year: number, month: number, day: number): PlainDate {
  if (!isValidParts(year, month, day)) {
    throw new InvalidDateError(`Not a valid date: ${year}-${month}-${day}`)
  }
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as PlainDate
}

export function toParts(date: PlainDate): DateParts {
  return {
    year: Number.parseInt(date.slice(0, 4), 10),
    month: Number.parseInt(date.slice(5, 7), 10),
    day: Number.parseInt(date.slice(8, 10), 10),
  }
}

// Days-from-civil and civil-from-days (Howard Hinnant), valid for the proleptic Gregorian calendar.
export function toEpochDays(date: PlainDate): number {
  const { year, month, day } = toParts(date)
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yearOfEra = y - era * 400
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

export function fromEpochDays(epochDays: number): PlainDate {
  const z = epochDays + 719468
  const era = Math.floor(z / 146097)
  const dayOfEra = z - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  )
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const mp = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0)
  return fromParts(year, month, day)
}

export function addDays(date: PlainDate, days: number): PlainDate {
  if (!Number.isInteger(days)) throw new RangeError('days must be an integer')
  return fromEpochDays(toEpochDays(date) + days)
}

/** Adds calendar months, clamping to the last day of shorter months (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: PlainDate, months: number): PlainDate {
  if (!Number.isInteger(months)) throw new RangeError('months must be an integer')
  const { year, month, day } = toParts(date)
  const monthIndex = year * 12 + (month - 1) + months
  const newYear = Math.floor(monthIndex / 12)
  const newMonth = monthIndex - newYear * 12 + 1
  return fromParts(newYear, newMonth, Math.min(day, daysInMonth(newYear, newMonth)))
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffInDays(to: PlainDate, from: PlainDate): number {
  return toEpochDays(to) - toEpochDays(from)
}

export function compareDates(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  // Fixed-width YYYY-MM-DD strings sort chronologically.
  return a < b ? -1 : a > b ? 1 : 0
}

export const isBefore = (a: PlainDate, b: PlainDate) => a < b
export const isAfter = (a: PlainDate, b: PlainDate) => a > b
export const minDate = (a: PlainDate, b: PlainDate) => (a <= b ? a : b)
export const maxDate = (a: PlainDate, b: PlainDate) => (a >= b ? a : b)

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export function dayOfWeek(date: PlainDate): number {
  // 1970-01-01 was a Thursday (4).
  return ((((toEpochDays(date) + 3) % 7) + 7) % 7) + 1
}

export function startOfMonth(date: PlainDate): PlainDate {
  const { year, month } = toParts(date)
  return fromParts(year, month, 1)
}

export function endOfMonth(date: PlainDate): PlainDate {
  const { year, month } = toParts(date)
  return fromParts(year, month, daysInMonth(year, month))
}
