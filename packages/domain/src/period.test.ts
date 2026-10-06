import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { plainDate } from './dates.ts'
import {
  daysElapsed,
  daysLeftIncluding,
  DEFAULT_PERIOD_START_DAY,
  isInPeriod,
  isPeriodStartDay,
  lastDayOf,
  nextPeriod,
  periodContaining,
  periodLength,
  previousPeriod,
  type Period,
} from './period.ts'
import { arbPlainDate, arbStartDay } from './testing/arbitraries.ts'

const d = plainDate
const period = (start: string, end: string): Period => ({ start: d(start), end: d(end) })

describe('periodContaining', () => {
  it('defaults to the 1st', () => {
    expect(DEFAULT_PERIOD_START_DAY).toBe(1)
  })

  it.each([
    // Start day 1: calendar months (ADR 0003)
    ['2026-10-06', 1, '2026-10-01', '2026-11-01'],
    ['2026-10-01', 1, '2026-10-01', '2026-11-01'],
    ['2026-10-31', 1, '2026-10-01', '2026-11-01'],
    ['2026-02-14', 1, '2026-02-01', '2026-03-01'],
    ['2026-12-31', 1, '2026-12-01', '2027-01-01'],
    // Start day 15: payday months
    ['2026-10-15', 15, '2026-10-15', '2026-11-15'],
    ['2026-10-14', 15, '2026-09-15', '2026-10-15'],
    ['2026-11-20', 15, '2026-11-15', '2026-12-15'],
    ['2027-01-03', 15, '2026-12-15', '2027-01-15'],
    // Start day 28 across February
    ['2024-02-29', 28, '2024-02-28', '2024-03-28'],
    ['2026-03-01', 28, '2026-02-28', '2026-03-28'],
  ])('%s with start day %i → [%s, %s)', (date, startDay, start, end) => {
    expect(periodContaining(d(date), startDay)).toEqual({ start, end })
  })

  it.each([0, 29, 31, -1, 1.5, Number.NaN])('rejects start day %s', (startDay) => {
    expect(isPeriodStartDay(startDay)).toBe(false)
    expect(() => periodContaining(d('2026-10-06'), startDay)).toThrow(RangeError)
    expect(() => nextPeriod(period('2026-10-01', '2026-11-01'), startDay)).toThrow(RangeError)
    expect(() => previousPeriod(period('2026-10-01', '2026-11-01'), startDay)).toThrow(RangeError)
  })
})

describe('period navigation', () => {
  it('moves to the next and previous period', () => {
    const october = period('2026-10-01', '2026-11-01')
    expect(nextPeriod(october, 1)).toEqual({ start: '2026-11-01', end: '2026-12-01' })
    expect(previousPeriod(october, 1)).toEqual({ start: '2026-09-01', end: '2026-10-01' })
  })

  it('stays contiguous when the start day changes (shorter transition period)', () => {
    const october = period('2026-10-01', '2026-11-01')
    expect(nextPeriod(october, 15)).toEqual({ start: '2026-11-01', end: '2026-11-15' })
    expect(previousPeriod(october, 15)).toEqual({ start: '2026-09-15', end: '2026-10-01' })
  })
})

describe('period measurements', () => {
  const october = period('2026-10-01', '2026-11-01')

  it('knows its length and last day', () => {
    expect(periodLength(october)).toBe(31)
    expect(periodLength(period('2026-02-01', '2026-03-01'))).toBe(28)
    expect(lastDayOf(october)).toBe('2026-10-31')
  })

  it('knows which dates it contains (end is exclusive)', () => {
    expect(isInPeriod(october, d('2026-10-01'))).toBe(true)
    expect(isInPeriod(october, d('2026-10-31'))).toBe(true)
    expect(isInPeriod(october, d('2026-11-01'))).toBe(false)
    expect(isInPeriod(october, d('2026-09-30'))).toBe(false)
  })

  it.each([
    ['2026-09-20', 31, 0], // before the period
    ['2026-10-01', 31, 0], // first day
    ['2026-10-22', 10, 21], // the mockup: 10 days left
    ['2026-10-31', 1, 30], // last day
    ['2026-11-01', 0, 31], // after the period
  ])('on %s: %i days left including today, %i elapsed', (today, left, elapsed) => {
    expect(daysLeftIncluding(october, d(today))).toBe(left)
    expect(daysElapsed(october, d(today))).toBe(elapsed)
  })
})

describe('period properties', () => {
  it('the period containing a date contains it, starts on the start day, and is 28–31 days', () => {
    fc.assert(
      fc.property(arbPlainDate, arbStartDay, (date, startDay) => {
        const p = periodContaining(date, startDay)
        const length = periodLength(p)
        return (
          isInPeriod(p, date) &&
          Number.parseInt(p.start.slice(8), 10) === startDay &&
          length >= 28 &&
          length <= 31
        )
      }),
    )
  })

  it('next and previous periods are contiguous and invert each other', () => {
    fc.assert(
      fc.property(arbPlainDate, arbStartDay, (date, startDay) => {
        const p = periodContaining(date, startDay)
        const next = nextPeriod(p, startDay)
        const prev = previousPeriod(p, startDay)
        return (
          next.start === p.end &&
          prev.end === p.start &&
          previousPeriod(next, startDay).start === p.start &&
          nextPeriod(prev, startDay).end === p.end &&
          periodContaining(next.start, startDay).end === next.end
        )
      }),
    )
  })

  it('days left plus days elapsed is the period length', () => {
    fc.assert(
      fc.property(arbPlainDate, arbPlainDate, arbStartDay, (date, today, startDay) => {
        const p = periodContaining(date, startDay)
        return daysLeftIncluding(p, today) + daysElapsed(p, today) === periodLength(p)
      }),
    )
  })
})
