import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  compareDates,
  diffInDays,
  isAfter,
  isBefore,
  plainDate,
  type PlainDate,
} from './dates.ts'
import { Money } from './money.ts'
import {
  applyWeekendPolicy,
  canAutoPost,
  expandRecurrence,
  isAmountMode,
  isFinished,
  isOccurrenceState,
  isRecurrenceExceptionAction,
  isRecurrenceFrequency,
  isRecurringRuleKind,
  isRecurringRuleStatus,
  isSeriesDate,
  isSuppressedByPause,
  isWeekend,
  isWeekendPolicy,
  lastSeriesDate,
  MAX_EXPANDED_OCCURRENCES,
  MAX_RECURRENCE_COUNT,
  monthlyEquivalent,
  nextBusinessDay,
  nextDueDate,
  nthSeriesDate,
  occurrenceAt,
  occurrencesToAutoPost,
  onBudgetEffect,
  previousBusinessDay,
  recurrenceFrequency,
  recurringRuleKind,
  seriesIndexOf,
  stateOf,
  UnknownRecurrenceFrequencyError,
  UnknownRecurringRuleKindError,
  type Occurrence,
  type RecurrenceException,
  type RecurrenceRule,
  type RecurrenceSchedule,
} from './recurrence.ts'
import { arbPlainDate } from './testing/arbitraries.ts'

const tl = (value: string) => Money.of(value, 'TRY')
const date = plainDate

/** A monthly rent rule on the 1st, which is the shape most of the MVP's rules have. */
const monthly = (overrides: Partial<RecurrenceSchedule> = {}): RecurrenceSchedule => ({
  freq: 'monthly',
  interval: 1,
  startDate: date('2026-01-01'),
  byMonthDay: null,
  weekendPolicy: 'none',
  endDate: null,
  maxCount: null,
  status: 'active',
  pausedFrom: null,
  pausedUntil: null,
  ...overrides,
})

const rule = (overrides: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  ...monthly(),
  amount: tl('11500.00'),
  amountMode: 'fixed',
  ...overrides,
})

const dueDates = (occurrences: readonly Occurrence[]) => occurrences.map((one) => one.dueDate)
const originalDates = (occurrences: readonly Occurrence[]) =>
  occurrences.map((one) => one.originalDate)

/* --------------------------------------------------------------- the vocabulary */

describe('the vocabulary', () => {
  it('recognizes the four frequencies', () => {
    expect(isRecurrenceFrequency('monthly')).toBe(true)
    expect(isRecurrenceFrequency('yearly')).toBe(true)
    // Quarterly is `monthly` with an interval of 3, not a frequency of its own.
    expect(isRecurrenceFrequency('quarterly')).toBe(false)
    expect(isRecurrenceFrequency(12)).toBe(false)
    expect(recurrenceFrequency('weekly')).toBe('weekly')
    expect(() => recurrenceFrequency('quarterly')).toThrow(UnknownRecurrenceFrequencyError)
  })

  it('recognizes what a confirm records', () => {
    expect(isRecurringRuleKind('expense')).toBe(true)
    expect(isRecurringRuleKind('transfer')).toBe(true)
    expect(isRecurringRuleKind('adjustment')).toBe(false)
    expect(recurringRuleKind('income')).toBe('income')
    expect(() => recurringRuleKind('opening_balance')).toThrow(UnknownRecurringRuleKindError)
  })

  it('recognizes the rest of the enumerations', () => {
    expect(isWeekendPolicy('next_business_day')).toBe(true)
    expect(isWeekendPolicy('holiday')).toBe(false)
    expect(isAmountMode('estimated')).toBe(true)
    expect(isAmountMode('learned')).toBe(false)
    expect(isRecurringRuleStatus('paused')).toBe(true)
    // There is no stored `ended`: that is derived from endDate and maxCount.
    expect(isRecurringRuleStatus('ended')).toBe(false)
    expect(isOccurrenceState('overdue')).toBe(true)
    expect(isOccurrenceState('late')).toBe(false)
    expect(isRecurrenceExceptionAction('skip')).toBe(true)
    // Posting is a transaction, never an exception.
    expect(isRecurrenceExceptionAction('posted')).toBe(false)
  })
})

/* ------------------------------------------------------------- the series dates */

describe('the dates a series falls on', () => {
  it('starts at the start date', () => {
    expect(nthSeriesDate(monthly(), 0)).toBe(date('2026-01-01'))
  })

  it('steps a month at a time', () => {
    expect(nthSeriesDate(monthly(), 1)).toBe(date('2026-02-01'))
    expect(nthSeriesDate(monthly(), 12)).toBe(date('2027-01-01'))
  })

  it('treats an interval as "every n"', () => {
    const quarterly = monthly({ interval: 3 })
    expect(nthSeriesDate(quarterly, 1)).toBe(date('2026-04-01'))
    expect(nthSeriesDate(quarterly, 4)).toBe(date('2027-01-01'))
  })

  it('counts days and weeks from the start date', () => {
    const daily = monthly({ freq: 'daily', interval: 10 })
    expect(nthSeriesDate(daily, 3)).toBe(date('2026-01-31'))

    // A weekly rule keeps its weekday: 2026-01-01 was a Thursday.
    const fortnightly = monthly({ freq: 'weekly', interval: 2 })
    expect(nthSeriesDate(fortnightly, 1)).toBe(date('2026-01-15'))
    expect(nthSeriesDate(fortnightly, 2)).toBe(date('2026-01-29'))
  })

  it('keeps a yearly rule on its month and day', () => {
    const insurance = monthly({ freq: 'yearly', startDate: date('2026-03-14') })
    expect(nthSeriesDate(insurance, 2)).toBe(date('2028-03-14'))
  })

  /*
   * §11: "day 29–31 falls on the month's last day in shorter months". The clamp is the bug
   * magnet, so the whole first year of a 31st rule is written out.
   */
  it('puts day 31 on the last day of every shorter month', () => {
    const last = monthly({ startDate: date('2026-01-31') })
    expect(Array.from({ length: 12 }, (_, index) => nthSeriesDate(last, index))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
    ])
  })

  it('never drifts after a short month', () => {
    // Stepping from the clamped date would give 28 March; the clamp is applied from day 31 again.
    expect(nthSeriesDate(monthly({ startDate: date('2026-01-31') }), 2)).toBe(date('2026-03-31'))
    expect(nthSeriesDate(monthly({ byMonthDay: 30, startDate: date('2026-01-15') }), 1)).toBe(
      date('2026-02-28'),
    )
  })

  it('takes the day of the month from byMonthDay when it has one', () => {
    expect(nthSeriesDate(monthly({ startDate: date('2026-01-05'), byMonthDay: 20 }), 0)).toBe(
      date('2026-01-20'),
    )
  })

  it('puts 29 February on the 28th in a common year', () => {
    const leapling = monthly({ freq: 'yearly', startDate: date('2028-02-29') })
    expect(nthSeriesDate(leapling, 1)).toBe(date('2029-02-28'))
    expect(nthSeriesDate(leapling, 4)).toBe(date('2032-02-29'))
  })

  it('refuses a schedule it cannot honour', () => {
    expect(() => nthSeriesDate(monthly({ interval: 0 }), 0)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly({ interval: 1.5 }), 0)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly({ interval: 400 }), 0)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly({ byMonthDay: 0 }), 0)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly({ byMonthDay: 32 }), 0)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly({ byMonthDay: 2.5 }), 0)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly({ maxCount: 0 }), 0)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly({ maxCount: 2.5 }), 0)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly({ maxCount: MAX_RECURRENCE_COUNT + 1 }), 0)).toThrow(
      RangeError,
    )
    expect(() => nthSeriesDate(monthly({ endDate: date('2025-12-31') }), 0)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly(), -1)).toThrow(RangeError)
    expect(() => nthSeriesDate(monthly(), 1.5)).toThrow(RangeError)
  })

  it('refuses a counted series that would run off the end of the calendar', () => {
    expect(() =>
      nthSeriesDate(monthly({ freq: 'yearly', interval: 50, maxCount: 500 }), 0),
    ).toThrow(RangeError)
    // The same count is fine when the steps are days rather than years.
    expect(nthSeriesDate(monthly({ freq: 'daily', interval: 50, maxCount: 500 }), 0)).toBe(
      date('2026-01-01'),
    )
    expect(nthSeriesDate(monthly({ freq: 'weekly', maxCount: 500 }), 0)).toBe(date('2026-01-01'))
  })

  it('is strictly increasing in the index, for every frequency', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('daily', 'weekly', 'monthly', 'yearly' as const),
        fc.integer({ min: 1, max: 12 }),
        arbPlainDate.filter((value) => value < '2100-01-01'),
        fc.integer({ min: 0, max: 40 }),
        (freq, interval, startDate, index) => {
          const schedule = monthly({ freq, interval, startDate, byMonthDay: null })
          expect(isBefore(nthSeriesDate(schedule, index), nthSeriesDate(schedule, index + 1))).toBe(
            true,
          )
        },
      ),
    )
  })
})

describe('finding a date in a series', () => {
  it('finds the index of a date the series falls on', () => {
    expect(seriesIndexOf(monthly(), date('2026-01-01'))).toBe(0)
    expect(seriesIndexOf(monthly(), date('2026-05-01'))).toBe(4)
    expect(seriesIndexOf(monthly({ startDate: date('2026-01-31') }), date('2026-02-28'))).toBe(1)
  })

  it('refuses a date the series never falls on', () => {
    expect(seriesIndexOf(monthly(), date('2026-05-02'))).toBeNull()
    // Before the start is not part of the series, however well it lines up.
    expect(seriesIndexOf(monthly(), date('2025-12-01'))).toBeNull()
    expect(isSeriesDate(monthly(), date('2026-05-01'))).toBe(true)
    expect(isSeriesDate(monthly(), date('2026-05-02'))).toBe(false)
  })

  it('refuses a date past the end of the series', () => {
    expect(seriesIndexOf(monthly({ maxCount: 3 }), date('2026-04-01'))).toBeNull()
    expect(seriesIndexOf(monthly({ maxCount: 3 }), date('2026-03-01'))).toBe(2)
    expect(seriesIndexOf(monthly({ endDate: date('2026-03-15') }), date('2026-04-01'))).toBeNull()
    expect(seriesIndexOf(monthly({ endDate: date('2026-03-15') }), date('2026-03-01'))).toBe(2)
  })

  it('round-trips every index for every frequency', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('daily', 'weekly', 'monthly', 'yearly' as const),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 60 }),
        (freq, interval, index) => {
          const schedule = monthly({ freq, interval, startDate: date('2026-01-31') })
          expect(seriesIndexOf(schedule, nthSeriesDate(schedule, index))).toBe(index)
        },
      ),
    )
  })
})

/* ---------------------------------------------------------------- weekends */

describe('the weekend policy', () => {
  // 2026-08-01 is a Saturday and 2026-08-02 a Sunday.
  const saturday = date('2026-08-01')
  const sunday = date('2026-08-02')
  const monday = date('2026-08-03')

  it('knows a weekend from a business day', () => {
    expect(isWeekend(saturday)).toBe(true)
    expect(isWeekend(sunday)).toBe(true)
    expect(isWeekend(monday)).toBe(false)
  })

  it('moves a weekend date to the business day either side', () => {
    expect(previousBusinessDay(saturday)).toBe(date('2026-07-31'))
    expect(previousBusinessDay(sunday)).toBe(date('2026-07-31'))
    expect(nextBusinessDay(saturday)).toBe(monday)
    expect(nextBusinessDay(sunday)).toBe(monday)
    // A business day is already one.
    expect(previousBusinessDay(monday)).toBe(monday)
    expect(nextBusinessDay(monday)).toBe(monday)
  })

  it('leaves a weekday alone whatever the policy', () => {
    for (const policy of ['none', 'previous_business_day', 'next_business_day'] as const) {
      expect(applyWeekendPolicy(monday, policy)).toBe(monday)
    }
  })

  it('applies the policy to a weekend date', () => {
    expect(applyWeekendPolicy(sunday, 'none')).toBe(sunday)
    expect(applyWeekendPolicy(sunday, 'previous_business_day')).toBe(date('2026-07-31'))
    expect(applyWeekendPolicy(sunday, 'next_business_day')).toBe(monday)
  })

  it('never moves a date by more than two days, and always onto a business day', () => {
    fc.assert(
      fc.property(
        arbPlainDate,
        fc.constantFrom('previous_business_day', 'next_business_day' as const),
        (value, policy) => {
          const moved = applyWeekendPolicy(value, policy)
          // Two is the worst case — Sunday back to Friday, Saturday on to Monday — and it is what
          // lets the expansion pad its search window by a fixed amount.
          expect(Math.abs(diffInDays(moved, value))).toBeLessThanOrEqual(2)
          expect(isWeekend(moved)).toBe(false)
        },
      ),
    )
  })
})

/* ------------------------------------------------------------ pause and end */

describe('pausing', () => {
  it('suppresses nothing while the rule is active', () => {
    expect(isSuppressedByPause(monthly(), date('2026-05-01'))).toBe(false)
  })

  it('suppresses the half-open window it was paused for', () => {
    const paused = monthly({
      status: 'paused',
      pausedFrom: date('2026-03-01'),
      pausedUntil: date('2026-06-01'),
    })
    // What was already overdue when the pause began is still the user's problem.
    expect(isSuppressedByPause(paused, date('2026-02-01'))).toBe(false)
    expect(isSuppressedByPause(paused, date('2026-03-01'))).toBe(true)
    expect(isSuppressedByPause(paused, date('2026-05-01'))).toBe(true)
    // Half-open: resuming on 1 June means 1 June is back.
    expect(isSuppressedByPause(paused, date('2026-06-01'))).toBe(false)
  })

  it('suppresses everything from the pause when there is no end to it', () => {
    const paused = monthly({
      status: 'paused',
      pausedFrom: date('2026-03-01'),
      pausedUntil: null,
    })
    expect(isSuppressedByPause(paused, date('2026-02-01'))).toBe(false)
    expect(isSuppressedByPause(paused, date('2099-01-01'))).toBe(true)
  })

  it('suppresses the whole series when the pause has no start either', () => {
    const paused = monthly({ status: 'paused' })
    expect(isSuppressedByPause(paused, date('2026-01-01'))).toBe(true)
  })
})

describe('whether a series is finished', () => {
  const today = date('2026-06-15')

  it('runs forever without an end date or a count', () => {
    expect(isFinished(monthly(), today)).toBe(false)
    expect(lastSeriesDate(monthly())).toBeNull()
  })

  it('is finished once its end date has passed', () => {
    expect(isFinished(monthly({ endDate: date('2026-06-14') }), today)).toBe(true)
    // Inclusive: a rule ending today is not finished today.
    expect(isFinished(monthly({ endDate: today }), today)).toBe(false)
  })

  it('is finished once its count is used up', () => {
    // Six occurrences from January: the last is 1 June, which is behind 15 June.
    expect(isFinished(monthly({ maxCount: 6 }), today)).toBe(true)
    expect(isFinished(monthly({ maxCount: 7 }), today)).toBe(false)
  })

  it('reports the last date, whichever limit comes first', () => {
    expect(lastSeriesDate(monthly({ maxCount: 3 }))).toBe(date('2026-03-01'))
    expect(lastSeriesDate(monthly({ endDate: date('2026-12-31') }))).toBe(date('2026-12-31'))
    expect(lastSeriesDate(monthly({ maxCount: 3, endDate: date('2026-12-31') }))).toBe(
      date('2026-03-01'),
    )
    expect(lastSeriesDate(monthly({ maxCount: 36, endDate: date('2026-12-31') }))).toBe(
      date('2026-12-31'),
    )
  })

  it('does not call a paused rule finished', () => {
    expect(isFinished(monthly({ status: 'paused', pausedFrom: date('2026-01-01') }), today)).toBe(
      false,
    )
  })
})

/* --------------------------------------------------------------- next due */

describe('the next due date', () => {
  const today = date('2026-10-22')

  it('finds the next occurrence on or after today', () => {
    expect(nextDueDate(rule(), { today })).toBe(date('2026-11-01'))
  })

  it('counts today itself', () => {
    expect(nextDueDate(rule({ byMonthDay: 22 }), { today })).toBe(today)
  })

  it('applies the weekend policy', () => {
    // 2026-11-01 is a Sunday.
    expect(nextDueDate(rule({ weekendPolicy: 'next_business_day' }), { today })).toBe(
      date('2026-11-02'),
    )
    expect(nextDueDate(rule({ weekendPolicy: 'previous_business_day' }), { today })).toBe(
      date('2026-10-30'),
    )
  })

  it('steps over an occurrence the user skipped', () => {
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-11-01'),
        action: 'skip',
        overrideDate: null,
        overrideAmount: null,
      },
    ]
    expect(nextDueDate(rule(), { today, exceptions })).toBe(date('2026-12-01'))
  })

  it('steps over an occurrence that has already been posted', () => {
    expect(nextDueDate(rule(), { today, postedDates: [date('2026-11-01')] })).toBe(
      date('2026-12-01'),
    )
  })

  it('follows an override to where it moved the occurrence', () => {
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-11-01'),
        action: 'override',
        overrideDate: date('2026-11-05'),
        overrideAmount: null,
      },
    ]
    expect(nextDueDate(rule(), { today, exceptions })).toBe(date('2026-11-05'))
  })

  it('steps over what a pause suppresses', () => {
    const paused = rule({
      status: 'paused',
      pausedFrom: date('2026-10-01'),
      pausedUntil: date('2027-01-01'),
    })
    expect(nextDueDate(paused, { today })).toBe(date('2027-01-01'))
  })

  it('has nothing more to give once the series is over', () => {
    expect(nextDueDate(rule({ endDate: date('2026-10-01') }), { today })).toBeNull()
    expect(nextDueDate(rule({ maxCount: 3 }), { today })).toBeNull()
    // Paused indefinitely: nothing inside the horizon.
    expect(nextDueDate(rule({ status: 'paused' }), { today })).toBeNull()
  })

  it('gives up past its horizon rather than searching forever', () => {
    expect(
      nextDueDate(rule({ freq: 'yearly', startDate: date('2030-01-01') }), {
        today,
        horizonDays: 30,
      }),
    ).toBeNull()
  })

  it('still answers for an occurrence an override moved from behind today to ahead of it', () => {
    /*
     * The series date has passed but the override pushed it forward, so the money has not been
     * expected yet — which is exactly what the Upcoming list has to say. Walking the series from
     * today would miss it entirely.
     */
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-10-01'),
        action: 'override',
        overrideDate: date('2026-10-25'),
        overrideAmount: null,
      },
    ]
    expect(nextDueDate(rule(), { today, exceptions })).toBe(date('2026-10-25'))
  })
})

/* -------------------------------------------------------------- the states */

describe('the state of one occurrence', () => {
  const today = date('2026-10-22')

  it('reads the timing from the due date', () => {
    const at = (dueDate: PlainDate) => stateOf({ dueDate, today, posted: false, skipped: false })
    expect(at(date('2026-10-23'))).toBe('upcoming')
    expect(at(today)).toBe('due')
    expect(at(date('2026-10-21'))).toBe('overdue')
  })

  it('lets settled beat timing', () => {
    const overdue = { dueDate: date('2026-10-01'), today }
    expect(stateOf({ ...overdue, posted: true, skipped: false })).toBe('posted')
    expect(stateOf({ ...overdue, posted: false, skipped: true })).toBe('skipped')
    // A posted occurrence is posted even if an exception also skipped it.
    expect(stateOf({ ...overdue, posted: true, skipped: true })).toBe('posted')
  })
})

/* -------------------------------------------------------------- expansion */

describe('expanding a rule into occurrences', () => {
  const today = date('2026-10-22')
  const window = { from: date('2026-10-01'), to: date('2026-10-31'), today }

  it('returns the occurrences whose due date is in the window', () => {
    const weekly = rule({ freq: 'weekly', startDate: date('2026-10-05') })
    expect(dueDates(expandRecurrence(weekly, window))).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ])
  })

  it('returns nothing for a window that ends before it starts', () => {
    expect(
      expandRecurrence(rule(), { from: date('2026-10-31'), to: date('2026-10-01'), today }),
    ).toEqual([])
  })

  it('returns nothing before the rule starts', () => {
    expect(expandRecurrence(rule({ startDate: date('2027-01-01') }), window)).toEqual([])
  })

  it('carries the amount and the index', () => {
    const [first] = expandRecurrence(rule({ byMonthDay: 15 }), window)
    expect(first?.index).toBe(9)
    expect(first?.amount.toDto()).toEqual({ amount: '11500.00', currency: 'TRY' })
    expect(first?.estimated).toBe(false)
    expect(first?.overridden).toBe(false)
  })

  it('marks an estimated amount as one', () => {
    const [first] = expandRecurrence(rule({ amountMode: 'estimated', byMonthDay: 26 }), window)
    expect(first?.estimated).toBe(true)
  })

  it('filters by the due date, not the series date', () => {
    /*
     * 1 November is a Sunday, so a previous-business-day rule is really paid on Friday
     * 30 October — which puts it in October's window and not November's.
     */
    const paidEarly = rule({ weekendPolicy: 'previous_business_day' })
    const october = expandRecurrence(paidEarly, window)
    expect(originalDates(october)).toContain('2026-11-01')
    expect(dueDates(october)).toContain('2026-10-30')

    const november = expandRecurrence(paidEarly, {
      from: date('2026-11-01'),
      to: date('2026-11-30'),
      today,
    })
    expect(originalDates(november)).not.toContain('2026-11-01')
  })

  it('keeps the original date as the identity when the policy moves the due date', () => {
    const [occurrence] = expandRecurrence(rule({ weekendPolicy: 'next_business_day' }), {
      from: date('2026-11-01'),
      to: date('2026-11-30'),
      today,
    })
    expect(occurrence?.originalDate).toBe(date('2026-11-01'))
    expect(occurrence?.dueDate).toBe(date('2026-11-02'))
  })

  it('stops at the end date and at the count', () => {
    const threeDays = rule({ freq: 'daily', startDate: date('2026-10-20'), maxCount: 3 })
    expect(dueDates(expandRecurrence(threeDays, window))).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ])

    const untilMidMonth = rule({
      freq: 'daily',
      startDate: date('2026-10-20'),
      endDate: date('2026-10-22'),
    })
    expect(dueDates(expandRecurrence(untilMidMonth, window))).toHaveLength(3)
  })

  it('leaves out what a pause suppresses', () => {
    const paused = rule({
      freq: 'weekly',
      startDate: date('2026-10-05'),
      status: 'paused',
      pausedFrom: date('2026-10-12'),
      pausedUntil: date('2026-10-26'),
    })
    expect(dueDates(expandRecurrence(paused, window))).toEqual(['2026-10-05', '2026-10-26'])
  })

  it('states each occurrence against today', () => {
    const weekly = rule({ freq: 'weekly', startDate: date('2026-10-05') })
    expect(expandRecurrence(weekly, window).map((one) => one.state)).toEqual([
      'overdue',
      'overdue',
      'overdue',
      'upcoming',
    ])

    const dueToday = rule({ freq: 'weekly', startDate: date('2026-10-08') })
    expect(expandRecurrence(dueToday, window).map((one) => one.state)).toContain('due')
  })

  it('hides what is already settled, unless asked for it', () => {
    const weekly = rule({ freq: 'weekly', startDate: date('2026-10-05') })
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-10-12'),
        action: 'skip',
        overrideDate: null,
        overrideAmount: null,
      },
    ]
    const postedDates = [date('2026-10-05')]

    expect(dueDates(expandRecurrence(weekly, { ...window, exceptions, postedDates }))).toEqual([
      '2026-10-19',
      '2026-10-26',
    ])

    const all = expandRecurrence(weekly, {
      ...window,
      exceptions,
      postedDates,
      includeSettled: true,
    })
    expect(all.map((one) => one.state)).toEqual(['posted', 'skipped', 'overdue', 'upcoming'])
  })

  it('applies an override to the date and the amount', () => {
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-10-01'),
        action: 'override',
        overrideDate: date('2026-10-09'),
        overrideAmount: tl('12000.00'),
      },
    ]
    const [occurrence] = expandRecurrence(rule(), { ...window, exceptions })
    expect(occurrence?.originalDate).toBe(date('2026-10-01'))
    expect(occurrence?.dueDate).toBe(date('2026-10-09'))
    expect(occurrence?.amount.toDto().amount).toBe('12000.00')
    expect(occurrence?.overridden).toBe(true)
  })

  it('treats an overridden amount as no longer an estimate', () => {
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-10-01'),
        action: 'override',
        overrideDate: null,
        overrideAmount: tl('812.40'),
      },
    ]
    const [occurrence] = expandRecurrence(rule({ amountMode: 'estimated' }), {
      ...window,
      exceptions,
    })
    expect(occurrence?.estimated).toBe(false)
    expect(occurrence?.dueDate).toBe(date('2026-10-01'))
  })

  it('finds an occurrence an override pulled into the window from outside it', () => {
    // The series date is in December, but the user moved that one payment into October.
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-12-01'),
        action: 'override',
        overrideDate: date('2026-10-28'),
        overrideAmount: null,
      },
    ]
    expect(originalDates(expandRecurrence(rule(), { ...window, exceptions }))).toEqual([
      '2026-10-01',
      '2026-12-01',
    ])
  })

  it('leaves out an occurrence an override pushed out of the window', () => {
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-10-01'),
        action: 'override',
        overrideDate: date('2026-11-04'),
        overrideAmount: null,
      },
    ]
    expect(expandRecurrence(rule(), { ...window, exceptions })).toEqual([])
  })

  it('ignores an override for a date the series never falls on', () => {
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-12-07'),
        action: 'override',
        overrideDate: date('2026-10-28'),
        overrideAmount: null,
      },
    ]
    expect(originalDates(expandRecurrence(rule(), { ...window, exceptions }))).toEqual([
      '2026-10-01',
    ])
  })

  it('ignores an override with no new date when matching the window', () => {
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-10-01'),
        action: 'override',
        overrideDate: null,
        overrideAmount: tl('1.00'),
      },
    ]
    expect(dueDates(expandRecurrence(rule(), { ...window, exceptions }))).toEqual(['2026-10-01'])
  })

  it('orders by due date, then by the series date', () => {
    /*
     * A Saturday and a Sunday pushed onto the same Monday keep the order they fall in, so a
     * list never reorders itself between two renders.
     */
    const weekend = rule({ freq: 'daily', startDate: date('2026-08-01'), maxCount: 2 })
    const occurrences = expandRecurrence(
      { ...weekend, weekendPolicy: 'next_business_day' },
      { from: date('2026-08-01'), to: date('2026-08-07'), today: date('2026-08-01') },
    )
    expect(dueDates(occurrences)).toEqual(['2026-08-03', '2026-08-03'])
    expect(originalDates(occurrences)).toEqual(['2026-08-01', '2026-08-02'])
  })

  it('stops at its guard rather than filling memory', () => {
    const everyDay = rule({ freq: 'daily', startDate: date('2020-01-01') })
    const occurrences = expandRecurrence(everyDay, {
      from: date('2020-01-01'),
      to: date('2060-01-01'),
      today,
    })
    expect(occurrences.length).toBeLessThanOrEqual(MAX_EXPANDED_OCCURRENCES)
  })

  it('always returns occurrences inside the window, in order', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('daily', 'weekly', 'monthly', 'yearly' as const),
        fc.integer({ min: 1, max: 6 }),
        fc.constantFrom('none', 'previous_business_day', 'next_business_day' as const),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 120 }),
        (freq, interval, weekendPolicy, offset, length) => {
          const from = addDays(date('2026-01-01'), offset)
          const to = addDays(from, length)
          const occurrences = expandRecurrence(
            rule({ freq, interval, weekendPolicy, startDate: date('2026-01-15') }),
            { from, to, today },
          )

          for (const occurrence of occurrences) {
            expect(isBefore(occurrence.dueDate, from)).toBe(false)
            expect(isAfter(occurrence.dueDate, to)).toBe(false)
            expect(
              isSeriesDate(
                rule({ freq, interval, startDate: date('2026-01-15') }),
                occurrence.originalDate,
              ),
            ).toBe(true)
          }
          for (let index = 1; index < occurrences.length; index += 1) {
            expect(
              compareDates(occurrences[index - 1]!.dueDate, occurrences[index]!.dueDate),
            ).not.toBe(1)
          }
        },
      ),
    )
  })

  it('never returns the same occurrence twice', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        (offset, length) => {
          const from = addDays(date('2026-01-01'), offset)
          const occurrences = expandRecurrence(rule({ freq: 'daily' }), {
            from,
            to: addDays(from, length),
            today,
          })
          expect(new Set(originalDates(occurrences)).size).toBe(occurrences.length)
        },
      ),
    )
  })
})

describe('looking up one occurrence by its series date', () => {
  const today = date('2026-10-22')

  it('builds the occurrence the series has on that date', () => {
    const occurrence = occurrenceAt(rule(), date('2026-10-01'), { today })
    expect(occurrence?.dueDate).toBe(date('2026-10-01'))
    expect(occurrence?.index).toBe(9)
    expect(occurrence?.state).toBe('overdue')
  })

  it('finds one however far an override moved its due date', () => {
    // A window would have to be a year wide to contain this; a lookup does not care.
    const exceptions: RecurrenceException[] = [
      {
        originalDate: date('2026-10-01'),
        action: 'override',
        overrideDate: date('2027-09-30'),
        overrideAmount: null,
      },
    ]
    const occurrence = occurrenceAt(rule(), date('2026-10-01'), { today, exceptions })
    expect(occurrence?.dueDate).toBe(date('2027-09-30'))
    expect(occurrence?.state).toBe('upcoming')
  })

  it('reports a posted occurrence as posted', () => {
    const occurrence = occurrenceAt(rule(), date('2026-10-01'), {
      today,
      postedDates: [date('2026-10-01')],
    })
    expect(occurrence?.state).toBe('posted')
  })

  it('has nothing for a date the series never falls on', () => {
    expect(occurrenceAt(rule(), date('2026-10-02'), { today })).toBeNull()
    expect(occurrenceAt(rule({ maxCount: 3 }), date('2026-10-01'), { today })).toBeNull()
  })

  it('has nothing for an occurrence a pause suppresses', () => {
    const paused = rule({
      status: 'paused',
      pausedFrom: date('2026-09-01'),
      pausedUntil: date('2026-11-01'),
    })
    expect(occurrenceAt(paused, date('2026-10-01'), { today })).toBeNull()
  })
})

/* -------------------------------------------------------------- the totals */

describe('what a rule costs in a month', () => {
  const at = (overrides: Partial<RecurrenceRule>) =>
    monthlyEquivalent(rule(overrides)).toDto().amount

  it('leaves a monthly rule alone', () => {
    expect(at({ amount: tl('549.00') })).toBe('549.00')
  })

  it('divides a quarterly or annual rule over its months', () => {
    expect(at({ interval: 3, amount: tl('1500.00') })).toBe('500.00')
    expect(at({ freq: 'yearly', amount: tl('6000.00') })).toBe('500.00')
    expect(at({ freq: 'yearly', interval: 2, amount: tl('6000.00') })).toBe('250.00')
  })

  it('divides the year rather than calling a month four weeks', () => {
    // 400 × 365 ÷ 84 = 1,738.095…, which rounds to 1,738.10 — not 1,600.
    expect(at({ freq: 'weekly', amount: tl('400.00') })).toBe('1738.10')
    expect(at({ freq: 'weekly', interval: 2, amount: tl('400.00') })).toBe('869.05')
  })

  it('scales a daily rule by the days in a year', () => {
    expect(at({ freq: 'daily', amount: tl('12.00') })).toBe('365.00')
  })
})

describe('what an occurrence does to the on-budget balance', () => {
  const amount = tl('5000.00')
  const effect = (figures: Parameters<typeof onBudgetEffect>[0]) =>
    onBudgetEffect(figures).toDto().amount

  it('takes an expense off and puts income on', () => {
    expect(effect({ kind: 'expense', amount, fromOnBudget: true })).toBe('-5000.00')
    expect(effect({ kind: 'income', amount, fromOnBudget: true })).toBe('5000.00')
  })

  it('ignores an account that is not in the budget', () => {
    expect(effect({ kind: 'expense', amount, fromOnBudget: false })).toBe('0.00')
    expect(effect({ kind: 'income', amount, fromOnBudget: false })).toBe('0.00')
  })

  it('counts a transfer inside the budget as nothing', () => {
    // Moving money to savings is not spending it; counting it would look like a loss.
    expect(effect({ kind: 'transfer', amount, fromOnBudget: true, toOnBudget: true })).toBe('0.00')
    expect(effect({ kind: 'transfer', amount, fromOnBudget: false, toOnBudget: false })).toBe(
      '0.00',
    )
  })

  it('counts a transfer that crosses the budget', () => {
    expect(effect({ kind: 'transfer', amount, fromOnBudget: true, toOnBudget: false })).toBe(
      '-5000.00',
    )
    expect(effect({ kind: 'transfer', amount, fromOnBudget: false, toOnBudget: true })).toBe(
      '5000.00',
    )
    // A missing destination is read as outside the budget.
    expect(effect({ kind: 'transfer', amount, fromOnBudget: true })).toBe('-5000.00')
  })
})

/* ------------------------------------------------------------ auto-posting */

describe('auto-posting', () => {
  const today = date('2026-10-22')
  const from = date('2026-08-01')

  it('is allowed only for a fixed amount the user opted in to', () => {
    expect(canAutoPost({ amountMode: 'fixed', autoPost: true })).toBe(true)
    expect(canAutoPost({ amountMode: 'fixed', autoPost: false })).toBe(false)
    // An estimate must never be posted unseen.
    expect(canAutoPost({ amountMode: 'estimated', autoPost: true })).toBe(false)
  })

  it('posts nothing for a rule that may not auto-post', () => {
    expect(
      occurrencesToAutoPost(
        { ...rule({ amountMode: 'estimated' }), autoPost: true },
        { from, today },
      ),
    ).toEqual([])
  })

  it('catches up every occurrence due on or before today', () => {
    const occurrences = occurrencesToAutoPost({ ...rule(), autoPost: true }, { from, today })
    expect(dueDates(occurrences)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01'])
  })

  it('includes one due today and never one due tomorrow', () => {
    const occurrences = occurrencesToAutoPost(
      { ...rule({ byMonthDay: 22 }), autoPost: true },
      { from, today },
    )
    expect(dueDates(occurrences)).toEqual(['2026-08-22', '2026-09-22', '2026-10-22'])
  })

  it('leaves alone what is already posted or skipped', () => {
    const occurrences = occurrencesToAutoPost(
      { ...rule(), autoPost: true },
      {
        from,
        today,
        postedDates: [date('2026-08-01')],
        exceptions: [
          {
            originalDate: date('2026-09-01'),
            action: 'skip',
            overrideDate: null,
            overrideAmount: null,
          },
        ],
      },
    )
    expect(dueDates(occurrences)).toEqual(['2026-10-01'])
  })
})
