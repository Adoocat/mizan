import type {
  OccurrenceDto,
  RecurringListResponse,
  RecurringRuleDto,
  UpcomingResponse,
} from '@mizan/contracts'
import { plainDate } from '@mizan/domain'
import { http, HttpResponse } from 'msw'
import { TEST_ACCOUNTS } from './accounts'
import { testCategory } from './categories'

const tl = (amount: string) => ({ amount, currency: 'TRY' as const })
// Hex only: these go through `z.uuid()` on the way in, exactly as the API's ids do.
const id = (suffix: string) => `019a2c1e-0000-7000-8000-00000009${suffix}`

const CHECKING = TEST_ACCOUNTS[0]!.id

function rule(overrides: Partial<RecurringRuleDto> & { id: string }): RecurringRuleDto {
  return {
    seriesId: overrides.id,
    name: 'Rule',
    kind: 'expense',
    payee: null,
    notes: null,
    amount: tl('549.00'),
    amountMode: 'fixed',
    accountId: CHECKING,
    toAccountId: null,
    categoryId: testCategory('groceries').id,
    goalId: null,
    freq: 'monthly',
    interval: 1,
    startDate: plainDate('2026-01-23'),
    byMonthDay: null,
    weekendPolicy: 'none',
    endDate: null,
    maxCount: null,
    status: 'active',
    pausedFrom: null,
    pausedUntil: null,
    autoPost: false,
    finished: false,
    nextDueDate: plainDate('2026-10-23'),
    monthlyEquivalent: tl('549.00'),
    lastDate: null,
    createdAt: '2026-01-23T08:00:00.000Z',
    ...overrides,
  }
}

/** The rules the mockups show: a fixed bill, an estimated one, a salary, and a paused gym. */
export const TEST_RULES: RecurringRuleDto[] = [
  rule({ id: id('0001'), name: 'Turkcell Superonline' }),
  rule({
    id: id('0002'),
    name: 'Enerjisa Electricity',
    amount: tl('720.00'),
    amountMode: 'estimated',
    nextDueDate: plainDate('2026-10-26'),
    monthlyEquivalent: tl('720.00'),
  }),
  rule({
    id: id('0003'),
    name: 'Salary',
    kind: 'income',
    amount: tl('46000.00'),
    categoryId: testCategory('salary').id,
    nextDueDate: plainDate('2026-10-25'),
    monthlyEquivalent: tl('46000.00'),
    autoPost: true,
  }),
  rule({
    id: id('0004'),
    name: 'MACFit membership',
    amount: tl('980.00'),
    status: 'paused',
    pausedFrom: plainDate('2026-10-22'),
    pausedUntil: plainDate('2027-01-01'),
    nextDueDate: plainDate('2027-01-23'),
    monthlyEquivalent: tl('980.00'),
  }),
]

export const TEST_RECURRING_LIST: RecurringListResponse = {
  rules: TEST_RULES,
  // 549 + 720 + 46,000 from the three that are running; the paused gym commits nothing.
  committedMonthly: tl('47269.00'),
}

function occurrence(overrides: Partial<OccurrenceDto> & { ruleId: string }): OccurrenceDto {
  const from = TEST_RULES.find((one) => one.id === overrides.ruleId)!
  return {
    ruleName: from.name,
    kind: from.kind,
    payee: null,
    originalDate: plainDate('2026-10-23'),
    dueDate: plainDate('2026-10-23'),
    state: 'upcoming',
    amount: from.amount,
    estimated: from.amountMode === 'estimated',
    overridden: false,
    accountId: from.accountId,
    toAccountId: null,
    categoryId: from.categoryId,
    goalId: null,
    transactionId: null,
    overdueDays: 0,
    ...overrides,
  }
}

/** The week the mockups depict, read on Thursday 22 October 2026. */
export const TEST_UPCOMING: UpcomingResponse = {
  today: plainDate('2026-10-22'),
  from: plainDate('2026-10-22'),
  to: plainDate('2026-10-28'),
  overdue: [
    occurrence({
      ruleId: id('0002'),
      ruleName: 'İSKİ Water',
      originalDate: plainDate('2026-10-19'),
      dueDate: plainDate('2026-10-19'),
      state: 'overdue',
      amount: tl('310.00'),
      estimated: false,
      overdueDays: 3,
    }),
  ],
  occurrences: [
    occurrence({ ruleId: id('0001') }),
    occurrence({
      ruleId: id('0002'),
      originalDate: plainDate('2026-10-26'),
      dueDate: plainDate('2026-10-26'),
    }),
    occurrence({
      ruleId: id('0003'),
      originalDate: plainDate('2026-10-25'),
      dueDate: plainDate('2026-10-25'),
    }),
  ],
  overdueTotal: tl('310.00'),
  dueTotal: tl('1269.00'),
  incomeTotal: tl('46000.00'),
  transferTotal: tl('0.00'),
  nextIncome: occurrence({
    ruleId: id('0003'),
    originalDate: plainDate('2026-10-25'),
    dueDate: plainDate('2026-10-25'),
  }),
  onBudgetBalance: tl('24850.00'),
  balanceAfterUpcoming: tl('69271.00'),
}

/** Read-only handlers for the recurring endpoints. Tests that mutate add their own on top. */
export const recurringHandlers = (
  list: RecurringListResponse = TEST_RECURRING_LIST,
  upcoming: UpcomingResponse = TEST_UPCOMING,
) => [
  http.get('*/api/v1/recurring', () => HttpResponse.json(list)),
  http.get('*/api/v1/upcoming', () => HttpResponse.json(upcoming)),
]
