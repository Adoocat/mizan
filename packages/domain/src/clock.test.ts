import { describe, expect, it } from 'vitest'
import { DEFAULT_TIME_ZONE, fixedClock, plainDateInZone, todayIn } from './clock.ts'

describe('clock', () => {
  it('defaults to Istanbul', () => {
    expect(DEFAULT_TIME_ZONE).toBe('Europe/Istanbul')
  })

  it('switches to the next Istanbul day at 21:00 UTC (UTC+3)', () => {
    expect(todayIn(fixedClock('2026-10-05T20:59:59Z'))).toBe('2026-10-05')
    expect(todayIn(fixedClock('2026-10-05T21:00:00Z'))).toBe('2026-10-06')
  })

  it('handles other time zones', () => {
    const instant = new Date('2026-10-06T02:00:00Z')
    expect(plainDateInZone(instant, 'America/New_York')).toBe('2026-10-05')
    expect(plainDateInZone(instant, 'UTC')).toBe('2026-10-06')
  })

  it('handles year boundaries', () => {
    expect(todayIn(fixedClock('2026-12-31T21:30:00Z'))).toBe('2027-01-01')
  })

  it('returns a fresh Date each time so callers cannot mutate the clock', () => {
    const clock = fixedClock(new Date('2026-10-06T09:00:00Z'))
    clock.now().setFullYear(2000)
    expect(clock.now().toISOString()).toBe('2026-10-06T09:00:00.000Z')
  })

  it('rejects invalid instants', () => {
    expect(() => fixedClock('not a date')).toThrow(RangeError)
  })
})
