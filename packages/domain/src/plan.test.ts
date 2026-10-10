import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, plainDate } from './dates.ts'
import { decimal } from './decimal.ts'
import { Money } from './money.ts'
import {
  allocatedTotal,
  budgetStatus,
  budgetUsage,
  countedIncome,
  expectedPace,
  isOverAllocated,
  isPlanLineTarget,
  isPlanPeriodStatus,
  planIncome,
  planLineAvailable,
  planLineBudget,
  planLineOverspend,
  planTotals,
  shiftExpectedDate,
  unassigned,
  type PlanLineFigures,
} from './plan.ts'
import { periodContaining } from './period.ts'
import { arbNonNegativeTry, arbTry } from './testing/arbitraries.ts'

const tl = (amount: string) => Money.of(amount, 'TRY')
const ZERO = Money.zero('TRY')
const amount = (money: Money) => money.toDto().amount

/** A line with no carry-in and no moves: what every line looks like in phase 6. */
const line = (planned: string, actual: string): PlanLineFigures => ({
  planned: tl(planned),
  actual: tl(actual),
})

/* ------------------------------------------------------------- golden plan */

/**
 * The 50,000 plan from the mockups (`design/new-design/Plan.dc.html`), which is also the phase's
 * definition of done: planned expenses 27,000, savings 6,000, investments 8,000, pool 9,000,
 * against 50,000 of income, with nothing left unassigned.
 */
const GOLDEN = {
  income: [
    { expected: tl('46000'), received: ZERO, actual: ZERO }, // salary, not yet confirmed
    { expected: tl('4000'), received: ZERO, actual: ZERO }, // freelance
  ],
  essential: [
    line('9500', '9500'), // rent
    line('6000', '4850'), // food & groceries
    line('1400', '1070'), // utilities
    line('600', '0'), // internet & phone
  ],
  flexible: [
    line('1800', '1420'), // transport
    line('700', '379'), // subscriptions
    line('500', '610'), // personal care — the one overspent line
    line('1000', '0'), // gym
  ],
  debt: [
    line('4200', '4200'), // personal loan
    line('1300', '1300'), // KYK student loan
  ],
  savings: [line('2500', '2500'), line('1000', '1000'), line('1000', '1000'), line('1500', '1500')],
  investments: [line('4000', '4000'), line('2000', '0'), line('2000', '0')],
  pool: [line('9000', '6000')],
}

const GOLDEN_LINES = [
  ...GOLDEN.essential,
  ...GOLDEN.flexible,
  ...GOLDEN.debt,
  ...GOLDEN.savings,
  ...GOLDEN.investments,
  ...GOLDEN.pool,
]

describe('the golden 50,000 plan', () => {
  it('splits into 27,000 / 6,000 / 8,000 / 9,000', () => {
    const plannedExpenses = allocatedTotal(
      [...GOLDEN.essential, ...GOLDEN.flexible, ...GOLDEN.debt],
      'TRY',
    )
    expect(amount(plannedExpenses)).toBe('27000.00')
    expect(amount(allocatedTotal(GOLDEN.savings, 'TRY'))).toBe('6000.00')
    expect(amount(allocatedTotal(GOLDEN.investments, 'TRY'))).toBe('8000.00')
    expect(amount(allocatedTotal(GOLDEN.pool, 'TRY'))).toBe('9000.00')
  })

  it('leaves nothing unassigned', () => {
    const income = planIncome(GOLDEN.income, 'TRY')
    const allocated = allocatedTotal(GOLDEN_LINES, 'TRY')

    expect(amount(income)).toBe('50000.00')
    expect(amount(allocated)).toBe('50000.00')
    expect(amount(unassigned({ income, allocated }))).toBe('0.00')
    expect(isOverAllocated(unassigned({ income, allocated }))).toBe(false)
  })

  it('reports the spending, remainder and overspend of each group', () => {
    const essential = planTotals(GOLDEN.essential, 'TRY')
    expect(amount(essential.planned)).toBe('17500.00')
    expect(amount(essential.actual)).toBe('15420.00')
    expect(amount(essential.available)).toBe('2080.00')
    expect(amount(essential.overspend)).toBe('0.00')

    const flexible = planTotals(GOLDEN.flexible, 'TRY')
    expect(amount(flexible.planned)).toBe('4000.00')
    expect(amount(flexible.actual)).toBe('2409.00')
    // Personal care is 110 over while the group as a whole still has money: both are true, and
    // the overspend must survive the summing.
    expect(amount(flexible.available)).toBe('1591.00')
    expect(amount(flexible.overspend)).toBe('110.00')
  })

  it('leaves the pool with 3,000 of its 9,000', () => {
    expect(amount(planLineAvailable(GOLDEN.pool[0]!))).toBe('3000.00')
  })
})

/* -------------------------------------------------------------------- lines */

describe('a plan line', () => {
  it('has planned minus actual available', () => {
    expect(amount(planLineAvailable(line('6000', '4850')))).toBe('1150.00')
  })

  it('counts a carry-in and the moves in and out of it', () => {
    const figures: PlanLineFigures = {
      planned: tl('6000'),
      carryIn: tl('350'),
      movesIn: tl('200'),
      movesOut: tl('50'),
      actual: tl('4850'),
    }
    expect(amount(planLineBudget(figures))).toBe('6500.00')
    expect(amount(planLineAvailable(figures))).toBe('1650.00')
  })

  it('reports an overspend as a positive amount', () => {
    const over = line('500', '610')
    expect(amount(planLineAvailable(over))).toBe('-110.00')
    expect(amount(planLineOverspend(over))).toBe('110.00')
  })

  it('has no overspend while it is inside its budget', () => {
    expect(amount(planLineOverspend(line('500', '500')))).toBe('0.00')
  })

  it('treats a refund as a negative actual, giving the money back', () => {
    // A ₺1,200 shop and a ₺200 return: the category has spent ₺1,000.
    expect(amount(planLineAvailable(line('6000', '1000')))).toBe('5000.00')
    // A category whose only movement is a refund is left with more than it was planned.
    expect(amount(planLineAvailable(line('500', '-120')))).toBe('620.00')
  })

  it('is fully overspent when it has no budget at all', () => {
    const unplanned = line('0', '250')
    expect(amount(planLineOverspend(unplanned))).toBe('250.00')
    expect(budgetUsage(unplanned)).toBeNull()
    expect(budgetStatus(unplanned, decimal('0.5'))).toBe('over')
  })
})

describe('plan totals', () => {
  it('are zero for a period with no lines', () => {
    const totals = planTotals([], 'TRY')
    expect(amount(totals.planned)).toBe('0.00')
    expect(amount(totals.available)).toBe('0.00')
    expect(amount(totals.overspend)).toBe('0.00')
  })

  it('sum the overspends rather than netting them against spare money', () => {
    const totals = planTotals([line('100', '150'), line('100', '0')], 'TRY')
    expect(amount(totals.available)).toBe('50.00')
    expect(amount(totals.overspend)).toBe('50.00')
  })
})

/* ------------------------------------------------------------------- income */

describe('income counting', () => {
  it('counts the expectation until the money arrives', () => {
    expect(amount(countedIncome({ expected: tl('46000'), received: ZERO, actual: ZERO }))).toBe(
      '46000.00',
    )
  })

  it('still counts the expectation when less has arrived than expected', () => {
    // Half the salary is in. The plan keeps expecting the rest rather than panicking.
    expect(
      amount(countedIncome({ expected: tl('46000'), received: ZERO, actual: tl('23000') })),
    ).toBe('46000.00')
  })

  it('switches to the actual amount once it exceeds the expectation', () => {
    // Flow F2: 53,500 arrived against 50,000 expected, so 3,500 is there to assign.
    expect(
      amount(countedIncome({ expected: tl('50000'), received: ZERO, actual: tl('53500') })),
    ).toBe('53500.00')
  })

  it('counts a confirmed item at the amount it was confirmed for', () => {
    // 48,000 arrived and the user confirmed it: the plan is now short by 2,000.
    const figures = { expected: ZERO, received: tl('48000'), actual: tl('48000') }
    expect(amount(countedIncome(figures))).toBe('48000.00')
  })

  it('does not count a confirmed item twice', () => {
    // One item confirmed at 46,000, a second still expecting 4,000, 46,000 in the ledger.
    const figures = { expected: tl('4000'), received: tl('46000'), actual: tl('46000') }
    expect(amount(countedIncome(figures))).toBe('50000.00')
  })

  it('adds income nobody planned for', () => {
    // A category with no plan item: everything recorded in it is unplanned income.
    expect(amount(countedIncome({ expected: ZERO, received: ZERO, actual: tl('1500') }))).toBe(
      '1500.00',
    )
  })

  it('ignores a confirmed item whose transaction was later deleted', () => {
    const figures = { expected: ZERO, received: tl('46000'), actual: ZERO }
    expect(amount(countedIncome(figures))).toBe('46000.00')
  })

  it('totals every income category', () => {
    expect(
      amount(
        planIncome(
          [
            { expected: tl('46000'), received: ZERO, actual: tl('46000') },
            { expected: tl('4000'), received: ZERO, actual: ZERO },
            { expected: ZERO, received: ZERO, actual: tl('1500') },
          ],
          'TRY',
        ),
      ),
    ).toBe('51500.00')
  })

  it('is zero when there is no income at all', () => {
    expect(amount(planIncome([], 'TRY'))).toBe('0.00')
  })
})

describe('unassigned', () => {
  it('is income minus what was allocated', () => {
    expect(amount(unassigned({ income: tl('50000'), allocated: tl('47000') }))).toBe('3000.00')
  })

  it('counts the pool carry-in as money to assign', () => {
    const left = unassigned({
      income: tl('50000'),
      poolCarryIn: tl('2350'),
      allocated: tl('50000'),
    })
    expect(amount(left)).toBe('2350.00')
  })

  it('goes negative when the plan promises more than the month brings', () => {
    const left = unassigned({ income: tl('48000'), allocated: tl('50000') })
    expect(amount(left)).toBe('-2000.00')
    expect(isOverAllocated(left)).toBe(true)
  })
})

/* -------------------------------------------------------- pace and statuses */

describe('expected pace', () => {
  const october = periodContaining(plainDate('2026-10-22'), 1)

  it('is the share of the period that has gone', () => {
    // 21 of October's 31 days are complete on the 22nd.
    expect(expectedPace(october, plainDate('2026-10-22')).toFixed(4)).toBe('0.6774')
  })

  it('is zero on the first day and before the period', () => {
    expect(expectedPace(october, plainDate('2026-10-01')).toFixed()).toBe('0')
    expect(expectedPace(october, plainDate('2026-09-20')).toFixed()).toBe('0')
  })

  it('is one for a period with no days in it at all', () => {
    // A degenerate range cannot come from `periodContaining`, but the guard keeps a division by
    // zero out of the pace marker if one is ever constructed by hand.
    const empty = { start: plainDate('2026-10-01'), end: plainDate('2026-10-01') }
    expect(expectedPace(empty, plainDate('2026-10-01')).toFixed()).toBe('1')
  })

  it('is one once the period is over', () => {
    expect(expectedPace(october, plainDate('2026-11-01')).toFixed()).toBe('1')
    expect(expectedPace(october, plainDate('2027-02-02')).toFixed()).toBe('1')
  })
})

describe('budget usage and status', () => {
  it('is the share of the budget that has been used', () => {
    expect(budgetUsage(line('6000', '4850'))?.toFixed(4)).toBe('0.8083')
  })

  it('counts a carry-in in the denominator', () => {
    const figures: PlanLineFigures = {
      planned: tl('6000'),
      carryIn: tl('2000'),
      actual: tl('4000'),
    }
    expect(budgetUsage(figures)?.toFixed()).toBe('0.5')
  })

  it.each([
    ['over its budget', line('500', '610'), '0.5', 'over'],
    ['past the pace', line('1000', '800'), '0.5', 'aheadOfPace'],
    ['exactly at the pace', line('1000', '500'), '0.5', 'aheadOfPace'],
    ['behind the pace', line('1000', '200'), '0.5', 'onPace'],
    ['untouched at the start', line('1000', '0'), '0', 'onPace'],
    ['fully spent on the last day', line('1000', '1000'), '1', 'aheadOfPace'],
  ])('is %s', (_label, figures, pace, expected) => {
    expect(budgetStatus(figures, decimal(pace))).toBe(expected)
  })

  it('reads an untouched line with no budget as on pace', () => {
    // Nothing planned and nothing spent: there is no percentage, and nothing is wrong either.
    expect(budgetStatus(line('0', '0'), decimal('0.5'))).toBe('onPace')
  })

  it('reads a refunded line as on pace, not ahead of it', () => {
    expect(budgetStatus(line('1000', '-50'), decimal('0.5'))).toBe('onPace')
  })
})

/* ------------------------------------------------------------ copying ahead */

describe('shifting an expected date into another period', () => {
  const october = periodContaining(plainDate('2026-10-15'), 1)
  const november = periodContaining(plainDate('2026-11-15'), 1)

  it('keeps the offset from the start of the period', () => {
    expect(shiftExpectedDate(plainDate('2026-10-05'), october, november)).toBe('2026-11-05')
  })

  it('keeps payday aligned when the period does not start on the 1st', () => {
    const from = periodContaining(plainDate('2026-10-20'), 15)
    const to = periodContaining(plainDate('2026-11-20'), 15)
    expect(shiftExpectedDate(plainDate('2026-10-20'), from, to)).toBe('2026-11-20')
  })

  it('clamps to the last day of a shorter period', () => {
    const january = periodContaining(plainDate('2026-01-31'), 1)
    const february = periodContaining(plainDate('2026-02-10'), 1)
    expect(shiftExpectedDate(plainDate('2026-01-31'), january, february)).toBe('2026-02-28')
  })

  it('clamps a date before the period to its first day', () => {
    expect(shiftExpectedDate(plainDate('2026-09-28'), october, november)).toBe('2026-11-01')
  })
})

/* ---------------------------------------------------------------- properties */

const arbLine = fc
  .record({ planned: arbNonNegativeTry, actual: arbTry })
  .map(({ planned, actual }): PlanLineFigures => ({ planned, actual }))

describe('properties', () => {
  it('splits every line into available or overspend, never both', () => {
    fc.assert(
      fc.property(arbLine, (figures) => {
        const available = planLineAvailable(figures)
        const overspend = planLineOverspend(figures)
        expect(overspend.isNegative()).toBe(false)
        if (available.isNegative()) expect(amount(overspend)).toBe(amount(available.negate()))
        else expect(overspend.isZero()).toBe(true)
      }),
    )
  })

  it('always has budget = actual + available', () => {
    fc.assert(
      fc.property(arbLine, (figures) => {
        expect(amount(figures.actual.plus(planLineAvailable(figures)).roundToMinor())).toBe(
          amount(planLineBudget(figures)),
        )
      }),
    )
  })

  it('totals the lines it is given, line by line', () => {
    fc.assert(
      fc.property(fc.array(arbLine, { maxLength: 30 }), (lines) => {
        const totals = planTotals(lines, 'TRY')
        expect(amount(totals.planned)).toBe(amount(allocatedTotal(lines, 'TRY')))
        // Available can be split into the money still there and the money overspent.
        const spare = lines.map(planLineAvailable).filter((value) => !value.isNegative())
        expect(amount(totals.available.plus(totals.overspend).roundToMinor())).toBe(
          amount(Money.sum(spare, 'TRY').roundToMinor()),
        )
      }),
    )
  })

  it('never counts less income than has either been expected or confirmed', () => {
    fc.assert(
      fc.property(
        arbNonNegativeTry,
        arbNonNegativeTry,
        arbNonNegativeTry,
        (expected, received, actual) => {
          const counted = countedIncome({ expected, received, actual })
          expect(counted.greaterThanOrEqual(received.plus(expected))).toBe(true)
          expect(counted.greaterThanOrEqual(actual)).toBe(true)
        },
      ),
    )
  })

  it('keeps unassigned equal to income plus carry-in minus allocated', () => {
    fc.assert(
      fc.property(
        arbNonNegativeTry,
        arbNonNegativeTry,
        arbNonNegativeTry,
        (income, poolCarryIn, allocated) => {
          const left = unassigned({ income, poolCarryIn, allocated })
          expect(amount(left.plus(allocated).roundToMinor())).toBe(
            amount(income.plus(poolCarryIn).roundToMinor()),
          )
        },
      ),
    )
  })

  it('keeps a shifted expected date inside the period it moved to', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 40 }),
        fc.integer({ min: 1, max: 28 }),
        (offset, startDay) => {
          const from = periodContaining(plainDate('2026-01-10'), startDay)
          const to = periodContaining(plainDate('2026-02-10'), startDay)
          const source = shiftExpectedDate(addDays(from.start, offset), from, to)
          expect(source >= to.start).toBe(true)
          expect(source < to.end).toBe(true)
        },
      ),
    )
  })
})

describe('guards', () => {
  it.each([
    ['category', true],
    ['goal', true],
    ['pool', true],
    ['income', false],
    ['', false],
  ])('recognises %s as a plan line target: %s', (value, expected) => {
    expect(isPlanLineTarget(value)).toBe(expected)
  })

  it.each([
    ['open', true],
    ['closed', true],
    ['reopened', false],
  ])('recognises %s as a period status: %s', (value, expected) => {
    expect(isPlanPeriodStatus(value)).toBe(expected)
  })
})
