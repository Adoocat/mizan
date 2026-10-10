import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { plainDate } from './dates.ts'
import { Money } from './money.ts'
import { periodContaining } from './period.ts'
import type { PlanLineFigures } from './plan.ts'
import {
  availableToSpend,
  checkCover,
  dailyAllowance,
  daysLeftToSpend,
  overAllocatedBy,
  suggestedCover,
  uncoveredOverspend,
} from './spend.ts'
import { arbNonNegativeTry, arbTry } from './testing/arbitraries.ts'

const tl = (amount: string) => Money.of(amount, 'TRY')
const ZERO = Money.zero('TRY')
const amount = (money: Money) => money.toDto().amount

const line = (planned: string, actual: string): PlanLineFigures => ({
  planned: tl(planned),
  actual: tl(actual),
})

describe('available to spend', () => {
  it('is what the pool has left when nothing is overspent', () => {
    expect(
      amount(
        availableToSpend({
          poolAvailable: tl('3000'),
          uncoveredOverspend: ZERO,
          unassigned: ZERO,
        }),
      ),
    ).toBe('3000.00')
  })

  it('drops by an overspend the moment it happens (decision D4)', () => {
    // Personal care is ₺110 over its line: the pool is not offering that ₺110 any more.
    const ats = availableToSpend({
      poolAvailable: tl('3000'),
      uncoveredOverspend: tl('110'),
      unassigned: ZERO,
    })
    expect(amount(ats)).toBe('2890.00')
  })

  it('drops by an over-allocation as well', () => {
    // The plan promises ₺2,000 more than the month will bring.
    const ats = availableToSpend({
      poolAvailable: tl('3000'),
      uncoveredOverspend: ZERO,
      unassigned: tl('-2000'),
    })
    expect(amount(ats)).toBe('1000.00')
  })

  it('ignores money that is still waiting to be assigned', () => {
    // ₺4,000 unassigned is not spending money: it has no job yet, and giving it one is the
    // user's decision.
    const ats = availableToSpend({
      poolAvailable: tl('3000'),
      uncoveredOverspend: ZERO,
      unassigned: tl('4000'),
    })
    expect(amount(ats)).toBe('3000.00')
  })

  it('never goes below zero', () => {
    const ats = availableToSpend({
      poolAvailable: tl('500'),
      uncoveredOverspend: tl('900'),
      unassigned: tl('-300'),
    })
    expect(amount(ats)).toBe('0.00')
  })

  it('sums the overspends of the lines it is given', () => {
    const lines = [line('500', '610'), line('1000', '1200'), line('6000', '4850')]
    expect(amount(uncoveredOverspend(lines, 'TRY'))).toBe('310.00')
  })

  it('reports an over-allocation as a positive deduction', () => {
    expect(amount(overAllocatedBy(tl('-2000')))).toBe('2000.00')
    expect(amount(overAllocatedBy(tl('2000')))).toBe('0.00')
    expect(amount(overAllocatedBy(ZERO))).toBe('0.00')
  })
})

describe('safe to spend today', () => {
  it('is the mockup example: ₺3,000 over ten days is ₺300 a day', () => {
    const allowance = dailyAllowance({
      availableAtStartOfToday: tl('3000'),
      availableNow: tl('3000'),
      daysLeft: 10,
    })
    expect(amount(allowance.safeToday)).toBe('300.00')
    expect(amount(allowance.spentToday)).toBe('0.00')
    expect(amount(allowance.remainingToday)).toBe('300.00')
  })

  it('leaves ₺215 of the day after ₺85 is spent', () => {
    const allowance = dailyAllowance({
      availableAtStartOfToday: tl('3000'),
      availableNow: tl('2915'),
      daysLeft: 10,
    })
    expect(amount(allowance.safeToday)).toBe('300.00')
    expect(amount(allowance.spentToday)).toBe('85.00')
    expect(amount(allowance.remainingToday)).toBe('215.00')
  })

  it('keeps the allowance steady as the day is spent', () => {
    // Spending does not shrink today's allowance; it is set once a day and spent down.
    const after = dailyAllowance({
      availableAtStartOfToday: tl('3000'),
      availableNow: tl('2600'),
      daysLeft: 10,
    })
    expect(amount(after.safeToday)).toBe('300.00')
    expect(amount(after.remainingToday)).toBe('-100.00')
  })

  it('rolls an unspent allowance into tomorrow by dividing by one day fewer', () => {
    // Nothing spent today, so tomorrow's figure is the same money over nine days.
    const tomorrow = dailyAllowance({
      availableAtStartOfToday: tl('3000'),
      availableNow: tl('3000'),
      daysLeft: 9,
    })
    expect(amount(tomorrow.safeToday)).toBe('333.33')
  })

  it('rounds the allowance down, never up', () => {
    // ₺1,000 over seven days is ₺142.857…; seven times ₺142.86 would be ₺1,000.02.
    const allowance = dailyAllowance({
      availableAtStartOfToday: tl('1000'),
      availableNow: tl('1000'),
      daysLeft: 7,
    })
    expect(amount(allowance.safeToday)).toBe('142.85')
  })

  it('gives the whole remainder on the last day of the period', () => {
    const allowance = dailyAllowance({
      availableAtStartOfToday: tl('412.37'),
      availableNow: tl('412.37'),
      daysLeft: 1,
    })
    expect(amount(allowance.safeToday)).toBe('412.37')
  })

  it('is zero once the period is over', () => {
    const allowance = dailyAllowance({
      availableAtStartOfToday: tl('3000'),
      availableNow: tl('3000'),
      daysLeft: 0,
    })
    expect(amount(allowance.safeToday)).toBe('0.00')
    expect(amount(allowance.remainingToday)).toBe('0.00')
  })

  it('is zero when there is nothing left to spend', () => {
    const allowance = dailyAllowance({
      availableAtStartOfToday: ZERO,
      availableNow: ZERO,
      daysLeft: 10,
    })
    expect(amount(allowance.safeToday)).toBe('0.00')
  })

  it('counts an overspend made today against the day, not against the allowance', () => {
    // ₺110 overspent on another line today: the allowance still reads ₺300, and ₺190 is left.
    const allowance = dailyAllowance({
      availableAtStartOfToday: tl('3000'),
      availableNow: tl('2890'),
      daysLeft: 10,
    })
    expect(amount(allowance.safeToday)).toBe('300.00')
    expect(amount(allowance.spentToday)).toBe('110.00')
    expect(amount(allowance.remainingToday)).toBe('190.00')
  })

  it('shows nothing spent on a day that brought money in', () => {
    // A ₺500 refund landed today, so there is more to spend than the day started with.
    const allowance = dailyAllowance({
      availableAtStartOfToday: tl('3000'),
      availableNow: tl('3500'),
      daysLeft: 10,
    })
    expect(amount(allowance.spentToday)).toBe('0.00')
    expect(amount(allowance.remainingToday)).toBe('800.00')
  })
})

describe('days left to spend', () => {
  const october = periodContaining(plainDate('2026-10-22'), 1)

  it.each([
    ['the 22nd of a 31-day month', '2026-10-22', 10],
    ['the first day', '2026-10-01', 31],
    ['the last day', '2026-10-31', 1],
    ['the day the next period starts', '2026-11-01', 0],
    ['a day after the period', '2026-12-05', 0],
    ['a day before the period', '2026-09-20', 31],
  ])('counts %s as %s days', (_label, today, expected) => {
    expect(daysLeftToSpend(october, plainDate(today))).toBe(expected)
  })

  it('divides the pool over the days that are left, on the mockup example', () => {
    const allowance = dailyAllowance({
      availableAtStartOfToday: tl('3000'),
      availableNow: tl('3000'),
      daysLeft: daysLeftToSpend(october, plainDate('2026-10-22')),
    })
    expect(amount(allowance.safeToday)).toBe('300.00')
  })
})

describe('covering an overspend', () => {
  const overspent = line('500', '610')
  const spare = line('6000', '4850')

  it('accepts a cover the source can afford', () => {
    expect(checkCover({ source: spare, target: overspent, amount: tl('110') })).toEqual({
      ok: true,
    })
  })

  it('suggests the whole overspend when the source can cover it', () => {
    expect(amount(suggestedCover({ source: spare, target: overspent }))).toBe('110.00')
  })

  it('suggests only what the source has when it cannot cover it all', () => {
    const almostEmpty = line('6000', '5950')
    expect(amount(suggestedCover({ source: almostEmpty, target: overspent }))).toBe('50.00')
  })

  it('suggests nothing from a source with nothing spare', () => {
    expect(amount(suggestedCover({ source: line('100', '100'), target: overspent }))).toBe('0.00')
  })

  it.each([
    ['nothing is overspent', spare, line('6000', '4000'), '100', 'nothingToCover'],
    ['the amount is zero', spare, overspent, '0', 'notPositive'],
    ['the amount is negative', spare, overspent, '-50', 'notPositive'],
    ['it is more than the overspend', spare, overspent, '200', 'moreThanOverspend'],
    ['the source has nothing spare', line('500', '500'), overspent, '110', 'sourceTooSmall'],
    ['the source is itself overspent', line('500', '700'), overspent, '110', 'sourceTooSmall'],
  ])('refuses when %s', (_label, source, target, value, refusal) => {
    expect(checkCover({ source, target, amount: tl(value) })).toEqual({ ok: false, refusal })
  })

  it('refuses to cover a line from itself', () => {
    expect(
      checkCover({ source: overspent, target: overspent, amount: tl('110'), sameLine: true }),
    ).toEqual({ ok: false, refusal: 'sameLine' })
  })

  it('leaves the plan whole: what the target gains the source loses', () => {
    // A cover is a move, not new money. The target's overspend goes, and the source's remainder
    // falls by the same amount — which is why `Allocated` never changes.
    const covered: PlanLineFigures = { ...overspent, movesIn: tl('110') }
    const source: PlanLineFigures = { ...spare, movesOut: tl('110') }

    expect(amount(uncoveredOverspend([covered, source], 'TRY'))).toBe('0.00')
    expect(
      amount(
        availableToSpend({
          poolAvailable: tl('3000'),
          uncoveredOverspend: uncoveredOverspend([covered, source], 'TRY'),
          unassigned: ZERO,
        }),
      ),
    ).toBe('3000.00')
  })

  it('frees up spending when the cover comes from a line, and not when it comes from the pool', () => {
    // From another line: the ₺110 was allocated elsewhere, so the pool keeps its ₺3,000.
    const fromLine = availableToSpend({
      poolAvailable: tl('3000'),
      uncoveredOverspend: ZERO,
      unassigned: ZERO,
    })
    // From the pool: the overspend is gone and the pool is ₺110 smaller. Same number either way.
    const fromPool = availableToSpend({
      poolAvailable: tl('2890'),
      uncoveredOverspend: ZERO,
      unassigned: ZERO,
    })
    expect(amount(fromLine)).toBe('3000.00')
    expect(amount(fromPool)).toBe('2890.00')
  })
})

describe('the whole chain, on the mockup month', () => {
  it('turns a ₺9,000 pool into ₺300 a day and ₺215 left after ₺85', () => {
    const october = periodContaining(plainDate('2026-10-22'), 1)
    const lines = [line('500', '610')] // personal care, ₺110 over

    const atStartOfToday = availableToSpend({
      poolAvailable: tl('9000').minus(tl('6000')),
      uncoveredOverspend: ZERO,
      unassigned: ZERO,
    })
    const now = availableToSpend({
      // ₺85 of pooled spending today.
      poolAvailable: tl('9000').minus(tl('6085')),
      uncoveredOverspend: ZERO,
      unassigned: ZERO,
    })

    const allowance = dailyAllowance({
      availableAtStartOfToday: atStartOfToday,
      availableNow: now,
      daysLeft: daysLeftToSpend(october, plainDate('2026-10-22')),
    })

    expect(amount(atStartOfToday)).toBe('3000.00')
    expect(amount(allowance.safeToday)).toBe('300.00')
    expect(amount(allowance.spentToday)).toBe('85.00')
    expect(amount(allowance.remainingToday)).toBe('215.00')
    // And with the overspend uncovered, every figure is ₺110 lower (decision D4).
    expect(
      amount(
        availableToSpend({
          poolAvailable: tl('3000'),
          uncoveredOverspend: uncoveredOverspend(lines, 'TRY'),
          unassigned: ZERO,
        }),
      ),
    ).toBe('2890.00')
  })
})

describe('properties', () => {
  it('never offers a negative amount to spend', () => {
    fc.assert(
      fc.property(arbTry, arbNonNegativeTry, arbTry, (poolAvailable, overspend, unassigned) => {
        const ats = availableToSpend({
          poolAvailable,
          uncoveredOverspend: overspend,
          unassigned,
        })
        expect(ats.isNegative()).toBe(false)
      }),
    )
  })

  it('never lets an overspend or a shortfall raise what can be spent', () => {
    fc.assert(
      fc.property(
        arbNonNegativeTry,
        arbNonNegativeTry,
        arbNonNegativeTry,
        (poolAvailable, overspend, shortfall) => {
          const clean = availableToSpend({
            poolAvailable,
            uncoveredOverspend: Money.zero('TRY'),
            unassigned: Money.zero('TRY'),
          })
          const strained = availableToSpend({
            poolAvailable,
            uncoveredOverspend: overspend,
            unassigned: shortfall.negate(),
          })
          expect(strained.lessThanOrEqual(clean)).toBe(true)
        },
      ),
    )
  })

  it('never promises more over the remaining days than there is', () => {
    fc.assert(
      fc.property(arbNonNegativeTry, fc.integer({ min: 1, max: 31 }), (available, daysLeft) => {
        const { safeToday } = dailyAllowance({
          availableAtStartOfToday: available,
          availableNow: available,
          daysLeft,
        })
        expect(safeToday.times(daysLeft).lessThanOrEqual(available)).toBe(true)
      }),
    )
  })

  it('always leaves today its allowance minus what today took', () => {
    fc.assert(
      fc.property(
        arbNonNegativeTry,
        arbTry,
        fc.integer({ min: 1, max: 31 }),
        (start, now, daysLeft) => {
          const allowance = dailyAllowance({
            availableAtStartOfToday: start,
            availableNow: now,
            daysLeft,
          })
          const effect = start.minus(now).roundToMinor()
          expect(amount(allowance.remainingToday.plus(effect).roundToMinor())).toBe(
            amount(allowance.safeToday),
          )
        },
      ),
    )
  })
})
