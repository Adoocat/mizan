import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  compareDates,
  dayOfWeek,
  daysInMonth,
  diffInDays,
  endOfMonth,
  fromEpochDays,
  fromParts,
  InvalidDateError,
  isAfter,
  isBefore,
  isLeapYear,
  isPlainDate,
  maxDate,
  minDate,
  plainDate,
  startOfMonth,
  toEpochDays,
  toParts,
} from './dates.ts'
import { arbPlainDate } from './testing/arbitraries.ts'

const d = plainDate

describe('validation', () => {
  it.each(['2026-10-06', '2024-02-29', '0001-01-01', '9999-12-31'])('accepts %s', (value) => {
    expect(isPlainDate(value)).toBe(true)
    expect(plainDate(value)).toBe(value)
  })

  it.each([
    '2026-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '0000-01-01',
    '2026-1-1',
    '2026-10-06T00:00',
    '',
  ])('rejects %j', (value) => {
    expect(isPlainDate(value)).toBe(false)
    expect(() => plainDate(value)).toThrow(InvalidDateError)
  })

  it('rejects non-strings', () => {
    expect(isPlainDate(20261006)).toBe(false)
  })

  it('validates parts', () => {
    expect(fromParts(2026, 2, 28)).toBe('2026-02-28')
    expect(() => fromParts(2026, 2, 29)).toThrow(InvalidDateError)
    expect(() => fromParts(2026, 1.5, 1)).toThrow(InvalidDateError)
    expect(toParts(d('2026-10-06'))).toEqual({ year: 2026, month: 10, day: 6 })
  })
})

describe('calendar facts', () => {
  it('knows leap years', () => {
    expect([2024, 2000, 2400].map(isLeapYear)).toEqual([true, true, true])
    expect([2026, 1900, 2100].map(isLeapYear)).toEqual([false, false, false])
  })

  it('knows month lengths', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m))).toEqual([
      31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ])
    expect(daysInMonth(2024, 2)).toBe(29)
  })

  it('knows days of the week', () => {
    expect(dayOfWeek(d('1970-01-01'))).toBe(4) // Thursday
    expect(dayOfWeek(d('2026-10-06'))).toBe(2) // Tuesday
    expect(dayOfWeek(d('2026-10-11'))).toBe(7) // Sunday
    expect(dayOfWeek(d('1969-12-29'))).toBe(1) // Monday, before the epoch
  })
})

describe('arithmetic', () => {
  it('converts to and from epoch days', () => {
    expect(toEpochDays(d('1970-01-01'))).toBe(0)
    expect(toEpochDays(d('2000-03-01'))).toBe(11017)
    expect(fromEpochDays(-1)).toBe('1969-12-31')
  })

  it('adds days across months, years and leap days', () => {
    expect(addDays(d('2026-10-31'), 1)).toBe('2026-11-01')
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01')
    expect(addDays(d('2024-02-28'), 1)).toBe('2024-02-29')
    expect(addDays(d('2026-03-01'), -1)).toBe('2026-02-28')
    expect(() => addDays(d('2026-03-01'), 0.5)).toThrow(RangeError)
  })

  it('adds months, clamping to month end', () => {
    expect(addMonths(d('2026-01-31'), 1)).toBe('2026-02-28')
    expect(addMonths(d('2024-01-31'), 1)).toBe('2024-02-29')
    expect(addMonths(d('2026-03-31'), -1)).toBe('2026-02-28')
    expect(addMonths(d('2026-11-15'), 2)).toBe('2027-01-15')
    expect(addMonths(d('2026-01-15'), -13)).toBe('2024-12-15')
    expect(() => addMonths(d('2026-01-15'), 1.5)).toThrow(RangeError)
  })

  it('measures days between dates', () => {
    expect(diffInDays(d('2026-11-01'), d('2026-10-01'))).toBe(31)
    expect(diffInDays(d('2026-10-01'), d('2026-11-01'))).toBe(-31)
  })

  it('compares', () => {
    expect(compareDates(d('2026-10-01'), d('2026-10-02'))).toBe(-1)
    expect(compareDates(d('2026-10-02'), d('2026-10-02'))).toBe(0)
    expect(compareDates(d('2026-10-03'), d('2026-10-02'))).toBe(1)
    expect(isBefore(d('2026-10-01'), d('2026-10-02'))).toBe(true)
    expect(isAfter(d('2026-10-01'), d('2026-10-02'))).toBe(false)
    expect(minDate(d('2026-10-01'), d('2026-10-02'))).toBe('2026-10-01')
    expect(minDate(d('2026-10-02'), d('2026-10-01'))).toBe('2026-10-01')
    expect(maxDate(d('2026-10-01'), d('2026-10-02'))).toBe('2026-10-02')
    expect(maxDate(d('2026-10-02'), d('2026-10-01'))).toBe('2026-10-02')
  })

  it('finds month bounds', () => {
    expect(startOfMonth(d('2026-10-06'))).toBe('2026-10-01')
    expect(endOfMonth(d('2024-02-10'))).toBe('2024-02-29')
  })
})

describe('date properties', () => {
  it('epoch days round-trip', () => {
    fc.assert(fc.property(arbPlainDate, (date) => fromEpochDays(toEpochDays(date)) === date))
  })

  it('addDays and diffInDays are inverses', () => {
    fc.assert(
      fc.property(arbPlainDate, fc.integer({ min: -5000, max: 5000 }), (date, n) => {
        const later = addDays(date, n)
        return diffInDays(later, date) === n && addDays(later, -n) === date
      }),
    )
  })

  it('string order matches chronological order', () => {
    fc.assert(
      fc.property(
        arbPlainDate,
        arbPlainDate,
        (a, b) => Math.sign(diffInDays(a, b)) === compareDates(a, b),
      ),
    )
  })

  it('consecutive days advance the weekday by one', () => {
    fc.assert(
      fc.property(
        arbPlainDate,
        (date) => (dayOfWeek(date) % 7) + 1 === dayOfWeek(addDays(date, 1)),
      ),
    )
  })

  it('addMonths never overflows into the following month', () => {
    fc.assert(
      fc.property(arbPlainDate, fc.integer({ min: -120, max: 120 }), (date, n) => {
        const { year, month } = toParts(date)
        const target = toParts(addMonths(date, n))
        return target.year * 12 + target.month - (year * 12 + month) === n
      }),
    )
  })
})
