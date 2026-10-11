import type { GoalDto, GoalListResponse, GoalResponse } from '@mizan/contracts'
import { plainDate } from '@mizan/domain'
import { http, HttpResponse } from 'msw'

const tl = (amount: string) => ({ amount, currency: 'TRY' as const })

/**
 * The goals the mockups show, as the API would return them: one of each type, with the figures
 * the server has already derived (PLAN §9).
 */
export const TEST_GOALS: GoalDto[] = [
  {
    id: '019a2c1e-0000-7000-8000-0000000000e1',
    type: 'emergency_fund',
    name: 'Emergency fund',
    note: null,
    // Three months of ₺24,800 of planned essentials, derived rather than stored.
    target: tl('74400.00'),
    targetDate: null,
    emergencyMonths: 3,
    repeat: null,
    keptInAccountId: '019a2c1e-0000-7000-8000-0000000000a2',
    priority: 0,
    earmarked: tl('82000.00'),
    spent: tl('0.00'),
    saved: tl('82000.00'),
    remaining: tl('0.00'),
    progress: '1.102150',
    requiredMonthly: null,
    monthsLeft: null,
    plannedMonthly: null,
    planLineId: null,
    projectedFinish: null,
    coverageMonths: '3.3',
    status: 'funded',
    archivedAt: null,
  },
  {
    id: '019a2c1e-0000-7000-8000-0000000000e2',
    type: 'savings',
    name: 'Japan trip',
    note: null,
    target: tl('35000.00'),
    targetDate: plainDate('2027-07-15'),
    emergencyMonths: null,
    repeat: null,
    keptInAccountId: null,
    priority: 1,
    earmarked: tl('24500.00'),
    spent: tl('0.00'),
    saved: tl('24500.00'),
    remaining: tl('10500.00'),
    progress: '0.700000',
    requiredMonthly: tl('1167.00'),
    monthsLeft: 9,
    plannedMonthly: tl('1000.00'),
    planLineId: '019a2c1e-0000-7000-8000-0000000000f2',
    projectedFinish: null,
    coverageMonths: null,
    status: 'behind',
    archivedAt: null,
  },
  {
    id: '019a2c1e-0000-7000-8000-0000000000e3',
    type: 'sinking_fund',
    name: 'Kasko insurance',
    note: 'Renews with Anadolu',
    target: tl('15000.00'),
    targetDate: plainDate('2027-02-10'),
    emergencyMonths: null,
    repeat: 'annual',
    keptInAccountId: null,
    priority: 2,
    earmarked: tl('3000.00'),
    spent: tl('0.00'),
    saved: tl('3000.00'),
    remaining: tl('12000.00'),
    progress: '0.200000',
    requiredMonthly: tl('3000.00'),
    monthsLeft: 4,
    plannedMonthly: null,
    planLineId: null,
    projectedFinish: null,
    coverageMonths: null,
    status: 'neutral',
    archivedAt: null,
  },
]

export const TEST_GOAL_LIST: GoalListResponse = {
  goals: TEST_GOALS,
  totalSaved: tl('109500.00'),
  totalTarget: tl('124400.00'),
  essentialMonthly: tl('24800.00'),
  overEarmarked: [],
}

/** One goal with its history, as `GET /goals/:id` answers. */
export const TEST_GOAL_RESPONSE: GoalResponse = {
  goal: TEST_GOALS[1]!,
  contributions: [
    {
      id: '019a2c1e-0000-7000-8000-0000000000c1',
      goalId: TEST_GOALS[1]!.id,
      date: plainDate('2026-10-05'),
      amount: tl('2500.00'),
      source: 'manual',
      transactionId: null,
      periodId: null,
      note: null,
      createdAt: '2026-10-05T09:00:00.000Z',
    },
  ],
}

export const goalHandlers = (list: GoalListResponse = TEST_GOAL_LIST) => [
  http.get('*/api/v1/goals', () => HttpResponse.json(list)),
  http.get('*/api/v1/goals/:id', () => HttpResponse.json(TEST_GOAL_RESPONSE)),
]
