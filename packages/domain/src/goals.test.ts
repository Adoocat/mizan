import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { plainDate } from './dates.ts'
import {
  checkContribution,
  contributionMonthsLeft,
  emergencyFundCoverage,
  emergencyFundTarget,
  goalProgress,
  goalRemaining,
  goalSaved,
  goalStatus,
  goalType,
  isEmergencyFundMonths,
  isGoalFunded,
  isGoalRepeat,
  isGoalContributionSource,
  isGoalType,
  monthsToFinish,
  overEarmarked,
  releasableAmount,
  requiredMonthly,
  UnknownGoalTypeError,
  REPEAT_MONTHS,
} from './goals.ts'
import { Money } from './money.ts'
import { periodContaining } from './period.ts'
import { arbNonNegativeTry, arbTry } from './testing/arbitraries.ts'

const tl = (value: string) => Money.of(value, 'TRY')
const ZERO = Money.zero('TRY')
const amount = (money: Money | null) => money?.toDto().amount ?? null
const october = periodContaining(plainDate('2026-10-22'), 1)

describe('goal types', () => {
  it('recognizes the three MVP types', () => {
    expect(isGoalType('emergency_fund')).toBe(true)
    expect(isGoalType('savings')).toBe(true)
    expect(isGoalType('sinking_fund')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isGoalType('combined')).toBe(false)
    expect(isGoalType(undefined)).toBe(false)
    expect(() => goalType('combined')).toThrow(UnknownGoalTypeError)
  })

  it('narrows a stored string to a type', () => {
    // What the service does with the `type` column, which a check constraint keeps in step.
    expect(goalType('sinking_fund')).toBe('sinking_fund')
  })

  it('recognizes where a contribution can come from', () => {
    expect(isGoalContributionSource('manual')).toBe(true)
    expect(isGoalContributionSource('plan_line')).toBe(true)
    expect(isGoalContributionSource('rollover')).toBe(true)
    // Spending out of a goal is a transaction line, not a contribution source (§9).
    expect(isGoalContributionSource('goal_funded')).toBe(false)
    expect(isGoalContributionSource(7)).toBe(false)
  })

  it('knows the repeat intervals a sinking fund can have', () => {
    expect(isGoalRepeat('annual')).toBe(true)
    expect(isGoalRepeat('weekly')).toBe(false)
    expect(REPEAT_MONTHS.annual).toBe(12)
    expect(REPEAT_MONTHS.quarterly).toBe(3)
  })

  it('offers 1, 3 and 6 months of emergency cover', () => {
    expect(isEmergencyFundMonths(3)).toBe(true)
    expect(isEmergencyFundMonths(4)).toBe(false)
  })
})

describe('what a goal holds', () => {
  it('is what was earmarked when nothing has been spent from it', () => {
    expect(amount(goalSaved({ earmarked: tl('82000'), spent: ZERO }))).toBe('82000.00')
  })

  it('drops when an expense is funded from the goal', () => {
    // A sinking fund paying the insurance it was built for: the goal falls, not this month's
    // spending (§9).
    expect(amount(goalSaved({ earmarked: tl('15000'), spent: tl('14200') }))).toBe('800.00')
  })

  it('counts a release as earmarking less', () => {
    // Releases are stored as negative contributions, so they are already inside `earmarked`.
    expect(amount(goalSaved({ earmarked: tl('5000').minus(tl('2000')), spent: ZERO }))).toBe(
      '3000.00',
    )
  })

  it('reports what is left to find, and never a negative remainder', () => {
    expect(amount(goalRemaining({ target: tl('150000'), saved: tl('82000') }))).toBe('68000.00')
    expect(amount(goalRemaining({ target: tl('40000'), saved: tl('41000') }))).toBe('0.00')
  })

  it('reads progress as a share of the target', () => {
    expect(goalProgress({ target: tl('40000'), saved: tl('27000') })?.toFixed(4)).toBe('0.6750')
  })

  it('has no progress to report without a target', () => {
    expect(goalProgress({ target: ZERO, saved: tl('500') })).toBeNull()
  })

  it('lets progress pass 100%, because over-funding is allowed', () => {
    // Decided for this phase: a goal may hold more than it needs, and the ring says so.
    expect(goalProgress({ target: tl('1000'), saved: tl('1250') })?.toFixed(2)).toBe('1.25')
    expect(isGoalFunded({ target: tl('1000'), saved: tl('1250') })).toBe(true)
  })

  it('is not funded by an empty target', () => {
    expect(isGoalFunded({ target: ZERO, saved: ZERO })).toBe(false)
  })
})

describe('contribution months left', () => {
  it('counts inclusively to the target month (§16)', () => {
    // October planning a December target: October, November, December.
    expect(contributionMonthsLeft(october, plainDate('2026-12-15'))).toBe(3)
  })

  it('gives a goal due this month one month to do it in', () => {
    expect(contributionMonthsLeft(october, plainDate('2026-10-31'))).toBe(1)
    expect(contributionMonthsLeft(october, plainDate('2026-10-01'))).toBe(1)
  })

  it('ignores the day of the month', () => {
    expect(contributionMonthsLeft(october, plainDate('2027-07-01'))).toBe(
      contributionMonthsLeft(october, plainDate('2027-07-28')),
    )
  })

  it('crosses a year boundary', () => {
    expect(contributionMonthsLeft(october, plainDate('2027-01-01'))).toBe(4)
  })

  it('goes non-positive once the target month has passed', () => {
    expect(contributionMonthsLeft(october, plainDate('2026-09-30'))).toBe(0)
    expect(contributionMonthsLeft(october, plainDate('2026-08-01'))).toBe(-1)
  })
})

describe('required monthly', () => {
  it('is the §9 example: ₺100,000 over ten months', () => {
    expect(amount(requiredMonthly({ target: tl('100000'), saved: ZERO, monthsLeft: 10 }))).toBe(
      '10000.00',
    )
  })

  it('is the §9 example: ₺15,000 over five months', () => {
    expect(amount(requiredMonthly({ target: tl('15000'), saved: ZERO, monthsLeft: 5 }))).toBe(
      '3000.00',
    )
  })

  it('counts what the goal already holds', () => {
    expect(
      amount(requiredMonthly({ target: tl('150000'), saved: tl('82000'), monthsLeft: 4 })),
    ).toBe('17000.00')
  })

  it('is null when the goal has no target date', () => {
    // Decided for this phase: no date means no denominator, so the card shows progress instead
    // of a number that would mean nothing.
    expect(requiredMonthly({ target: tl('40000'), saved: ZERO, monthsLeft: null })).toBeNull()
  })

  it('is zero once the goal is funded', () => {
    expect(amount(requiredMonthly({ target: tl('1000'), saved: tl('1000'), monthsLeft: 3 }))).toBe(
      '0.00',
    )
    expect(amount(requiredMonthly({ target: tl('1000'), saved: tl('1500'), monthsLeft: 3 }))).toBe(
      '0.00',
    )
  })

  it('asks for the whole remainder once the target month has gone', () => {
    expect(amount(requiredMonthly({ target: tl('5000'), saved: tl('1000'), monthsLeft: 0 }))).toBe(
      '4000.00',
    )
    expect(amount(requiredMonthly({ target: tl('5000'), saved: ZERO, monthsLeft: -2 }))).toBe(
      '5000.00',
    )
  })

  it('rounds up, so the contributions actually reach the target', () => {
    // ₺10,000 over three months: half-up would give 3,333.33 and land a kuruş short.
    const required = requiredMonthly({ target: tl('10000'), saved: ZERO, monthsLeft: 3 })
    expect(amount(required)).toBe('3333.34')
    expect(required!.times(3).greaterThanOrEqual(tl('10000'))).toBe(true)
  })

  it('never falls short of the target, for any remainder and any number of months', () => {
    fc.assert(
      fc.property(arbNonNegativeTry, fc.integer({ min: 1, max: 600 }), (target, monthsLeft) => {
        const required = requiredMonthly({ target, saved: ZERO, monthsLeft })
        // The whole point of rounding up: months × required covers the target every time.
        expect(required!.times(monthsLeft).greaterThanOrEqual(target)).toBe(true)
      }),
    )
  })

  it('is never negative', () => {
    fc.assert(
      fc.property(arbNonNegativeTry, arbNonNegativeTry, (target, saved) => {
        const required = requiredMonthly({ target, saved, monthsLeft: 6 })
        expect(required!.isNegative()).toBe(false)
      }),
    )
  })
})

describe('months to finish', () => {
  it('is how many months of a plan line the goal still needs', () => {
    expect(monthsToFinish({ target: tl('40000'), saved: tl('27000'), monthly: tl('2000') })).toBe(7)
  })

  it('rounds up, since a part month is still a month', () => {
    expect(monthsToFinish({ target: tl('1000'), saved: ZERO, monthly: tl('300') })).toBe(4)
  })

  it('is zero once the goal is funded', () => {
    expect(monthsToFinish({ target: tl('1000'), saved: tl('1000'), monthly: tl('300') })).toBe(0)
  })

  it('is null when nothing is going in, because then it never finishes', () => {
    expect(monthsToFinish({ target: tl('1000'), saved: ZERO, monthly: ZERO })).toBeNull()
  })
})

describe('emergency fund', () => {
  it('targets months of essential spending (§9)', () => {
    // Three months of the mockup's ₺24,800 of essentials.
    expect(amount(emergencyFundTarget({ months: 3, essentialMonthly: tl('24800') }))).toBe(
      '74400.00',
    )
  })

  it('scales with the plan, which is why the target is derived and not stored', () => {
    const one = emergencyFundTarget({ months: 6, essentialMonthly: tl('20000') })
    const after = emergencyFundTarget({ months: 6, essentialMonthly: tl('22000') })
    expect(after.greaterThan(one)).toBe(true)
  })

  it('is nothing when the plan has no essentials yet', () => {
    expect(amount(emergencyFundTarget({ months: 3, essentialMonthly: ZERO }))).toBe('0.00')
  })

  it('reports coverage in months: the §16 figure of 3.3', () => {
    const coverage = emergencyFundCoverage({ saved: tl('82000'), essentialMonthly: tl('24800') })
    expect(coverage?.toFixed(1)).toBe('3.3')
  })

  it('has no coverage to report without essentials', () => {
    expect(emergencyFundCoverage({ saved: tl('82000'), essentialMonthly: ZERO })).toBeNull()
  })
})

describe('goal status', () => {
  const target = tl('40000')

  it('is funded once the goal holds its target', () => {
    expect(goalStatus({ target, saved: target })).toBe('funded')
  })

  it('is behind when the plan line is smaller than the goal needs', () => {
    expect(
      goalStatus({
        target,
        saved: tl('27000'),
        plannedMonthly: tl('2000'),
        requiredMonthly: tl('4333.34'),
      }),
    ).toBe('behind')
  })

  it('is on track when the line keeps up', () => {
    expect(
      goalStatus({
        target,
        saved: tl('27000'),
        plannedMonthly: tl('5000'),
        requiredMonthly: tl('4333.34'),
      }),
    ).toBe('onTrack')
  })

  it('is on track when the line is exactly what is required', () => {
    expect(
      goalStatus({
        target,
        saved: ZERO,
        plannedMonthly: tl('4000'),
        requiredMonthly: tl('4000'),
      }),
    ).toBe('onTrack')
  })

  it('is neutral without a date to measure against', () => {
    expect(
      goalStatus({ target, saved: tl('100'), plannedMonthly: tl('2000'), requiredMonthly: null }),
    ).toBe('neutral')
  })

  it('is neutral without a plan line, because nothing is being measured', () => {
    expect(goalStatus({ target, saved: tl('100'), requiredMonthly: tl('4000') })).toBe('neutral')
  })

  it('prefers funded over every other reading', () => {
    expect(
      goalStatus({
        target,
        saved: tl('50000'),
        plannedMonthly: ZERO,
        requiredMonthly: tl('9999'),
      }),
    ).toBe('funded')
  })
})

describe('over-earmarking', () => {
  it('reports how much more is earmarked than the account holds (§9)', () => {
    expect(amount(overEarmarked({ earmarked: tl('90000'), accountBalance: tl('82000') }))).toBe(
      '8000.00',
    )
  })

  it('is zero when every earmark is backed', () => {
    expect(amount(overEarmarked({ earmarked: tl('50000'), accountBalance: tl('82000') }))).toBe(
      '0.00',
    )
  })

  it('is never negative, whatever the balance', () => {
    fc.assert(
      fc.property(arbTry, arbTry, (earmarked, accountBalance) => {
        expect(overEarmarked({ earmarked, accountBalance }).isNegative()).toBe(false)
      }),
    )
  })
})

describe('contributing', () => {
  it('accepts an earmark', () => {
    expect(checkContribution({ amount: tl('2000'), saved: tl('5000') })).toEqual({ ok: true })
  })

  it('accepts a release of what the goal holds', () => {
    expect(checkContribution({ amount: tl('-5000'), saved: tl('5000') })).toEqual({ ok: true })
  })

  it('refuses a contribution of nothing', () => {
    expect(checkContribution({ amount: ZERO, saved: tl('5000') })).toEqual({
      ok: false,
      refusal: 'notPositive',
    })
  })

  it('refuses releasing more than the goal holds', () => {
    // The goal would be claiming to owe the pool, which is not a thing money does.
    expect(checkContribution({ amount: tl('-5001'), saved: tl('5000') })).toEqual({
      ok: false,
      refusal: 'moreThanSaved',
    })
  })

  it('refuses an archived goal, which takes nothing new', () => {
    expect(checkContribution({ amount: tl('100'), saved: ZERO, archived: true })).toEqual({
      ok: false,
      refusal: 'goalArchived',
    })
  })

  it('allows an earmark past the target', () => {
    expect(checkContribution({ amount: tl('10000'), saved: tl('5000') })).toEqual({ ok: true })
  })

  it('offers the whole balance to release, and never a negative amount', () => {
    expect(amount(releasableAmount(tl('5000')))).toBe('5000.00')
    expect(amount(releasableAmount(tl('-20')))).toBe('0.00')
  })

  it('accepts exactly what it offers to release', () => {
    fc.assert(
      fc.property(arbNonNegativeTry, (saved) => {
        const release = releasableAmount(saved)
        if (release.isZero()) return
        expect(checkContribution({ amount: release.negate(), saved })).toEqual({ ok: true })
      }),
    )
  })
})
