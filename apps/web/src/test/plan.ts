import {
  moneyFromDto,
  type MoneyDto,
  type PlanChildRowDto,
  type PlanGroupDto,
  type PlanResponse,
  type PlanRowDto,
} from '@mizan/contracts'
import { Money, plainDate } from '@mizan/domain'
import { http, HttpResponse } from 'msw'
import { testCategory } from './categories'

const tl = (amount: string) => Money.of(amount, 'TRY').roundToMinor().toDto()
const ZERO = tl('0')
let counter = 0
/** A stable, syntactically valid uuid per fixture row. */
const id = (): string => `019a2c1e-0000-7000-8000-0000000e${String(++counter).padStart(4, '0')}`

/** A row with a line of its own: the API has already applied the domain's rules to it. */
function line(
  categoryKey: string,
  planned: string,
  actual: string,
  overrides: Partial<PlanChildRowDto> = {},
): PlanRowDto {
  const available = Money.of(planned, 'TRY').minus(Money.of(actual, 'TRY'))
  return {
    lineId: id(),
    target: 'category',
    categoryId: testCategory(categoryKey).id,
    planned: tl(planned),
    carryIn: ZERO,
    movesIn: ZERO,
    movesOut: ZERO,
    actual: tl(actual),
    available: available.roundToMinor().toDto(),
    overspend: (available.isNegative() ? available.negate() : Money.zero('TRY'))
      .roundToMinor()
      .toDto(),
    rollover: false,
    coveredBy: null,
    sortOrder: 1,
    version: 1,
    children: [],
    ...overrides,
  }
}

/** A flexible category with no line of its own: the pool answers for it (§10). */
function pooled(categoryKey: string, actual: string): PlanRowDto {
  return {
    lineId: null,
    target: 'category',
    categoryId: testCategory(categoryKey).id,
    planned: ZERO,
    carryIn: ZERO,
    movesIn: ZERO,
    movesOut: ZERO,
    actual: tl(actual),
    available: ZERO,
    overspend: ZERO,
    rollover: false,
    coveredBy: 'pool',
    sortOrder: 2,
    version: null,
    children: [],
  }
}

function groupOf(
  kind: PlanGroupDto['kind'],
  systemKey: string,
  rows: PlanRowDto[],
  sortOrder: number,
): PlanGroupDto {
  /** Only the rows that answer for themselves, the same rule the API totals by (§10). */
  const sum = (pick: (row: PlanRowDto) => MoneyDto) =>
    Money.sum(
      rows.filter((row) => row.coveredBy === null).map((row) => moneyFromDto(pick(row))),
      'TRY',
    )
      .roundToMinor()
      .toDto()

  return {
    id: kind === 'pool' ? null : id(),
    kind,
    name: systemKey,
    systemKey,
    renamed: false,
    sortOrder,
    rows,
    planned: sum((row) => row.planned),
    actual: sum((row) => row.actual),
    available: sum((row) => row.available),
    overspend: sum((row) => row.overspend),
  }
}

const POOL_ROW: PlanRowDto = {
  lineId: id(),
  target: 'pool',
  categoryId: null,
  planned: tl('9000.00'),
  carryIn: ZERO,
  movesIn: ZERO,
  movesOut: ZERO,
  actual: tl('2850.00'),
  available: tl('6150.00'),
  overspend: ZERO,
  rollover: false,
  coveredBy: null,
  sortOrder: 9999,
  version: 3,
  children: [],
}

/**
 * October 2026 as the API would return it: two essentials with their own lines, one flexible
 * category over its line, one covered by the pool, and a salary nobody has confirmed yet.
 */
export const TEST_PLAN: PlanResponse = {
  period: {
    id: id(),
    start: plainDate('2026-10-01'),
    end: plainDate('2026-11-01'),
    status: 'open',
    closedAt: null,
    previousStart: plainDate('2026-09-01'),
    nextStart: plainDate('2026-11-01'),
    daysElapsed: 21,
    days: 31,
  },
  summary: {
    income: tl('46000.00'),
    unplannedIncome: ZERO,
    poolCarryIn: ZERO,
    allocated: tl('17300.00'),
    unassigned: tl('28700.00'),
    spent: tl('9730.00'),
    overspend: tl('110.00'),
    uncategorizedSpending: ZERO,
  },
  /*
   * The pool has ₺9,000 with ₺2,850 spent, and personal care is ₺110 over its line, so what can
   * be spent is ₺6,040 (decision D4). Twenty-one of October's 31 days are gone: ₺604 a day.
   */
  spend: {
    poolBudget: tl('9000.00'),
    poolSpent: tl('2850.00'),
    poolAvailable: tl('6150.00'),
    uncoveredOverspend: tl('110.00'),
    overAllocated: ZERO,
    availableToSpend: tl('6040.00'),
    availableAtStartOfToday: tl('6040.00'),
    daysLeft: 10,
    safeToday: tl('604.00'),
    spentToday: ZERO,
    remainingToday: tl('604.00'),
  },
  groups: [
    groupOf(
      'essential',
      'essentials',
      [line('groceries', '6000', '4850'), line('transport', '1800', '1420')],
      2,
    ),
    groupOf(
      'flexible',
      'flexible',
      [line('personalCare', '500', '610'), pooled('diningOut', '2850')],
      3,
    ),
    groupOf('pool', 'pool', [POOL_ROW], 9),
  ],
  incomeItems: [
    {
      id: id(),
      categoryId: testCategory('salary').id,
      label: 'Salary',
      expected: tl('46000.00'),
      expectedDate: plainDate('2026-10-01'),
      received: null,
      receivedAt: null,
      categoryActual: ZERO,
      sortOrder: 1,
    },
  ],
  moves: [],
  copyableFrom: plainDate('2026-09-01'),
}

/** Read-only handlers for the plan endpoints. Tests that mutate add their own on top. */
export function planHandlers(plan: PlanResponse = TEST_PLAN) {
  return [
    http.get('*/api/v1/plans/current', () => HttpResponse.json(plan)),
    http.get('*/api/v1/plans/:start', () => HttpResponse.json(plan)),
  ]
}

/**
 * The same plan with one overspend covered from another line, as the API would return it: the
 * covered line's budget rises by the amount and the source line's falls, and the move is listed.
 */
export function withCover(
  plan: PlanResponse,
  targetKey: string,
  sourceKey: string,
  amount: string,
): PlanResponse {
  const moved = Money.of(amount, 'TRY')
  const targetId = testCategory(targetKey).id
  const sourceId = testCategory(sourceKey).id

  const adjust = (row: PlanRowDto): PlanRowDto => {
    if (row.categoryId !== targetId && row.categoryId !== sourceId) return row
    const isTarget = row.categoryId === targetId
    const figures = {
      planned: moneyFromDto(row.planned),
      carryIn: moneyFromDto(row.carryIn),
      movesIn: isTarget ? moved : Money.zero('TRY'),
      movesOut: isTarget ? Money.zero('TRY') : moved,
      actual: moneyFromDto(row.actual),
    }
    const available = figures.planned
      .plus(figures.movesIn)
      .minus(figures.movesOut)
      .minus(figures.actual)

    return {
      ...row,
      movesIn: figures.movesIn.roundToMinor().toDto(),
      movesOut: figures.movesOut.roundToMinor().toDto(),
      available: available.roundToMinor().toDto(),
      overspend: (available.isNegative() ? available.negate() : Money.zero('TRY'))
        .roundToMinor()
        .toDto(),
    }
  }

  const groups = plan.groups.map((group) => ({ ...group, rows: group.rows.map(adjust) }))
  const lineOf = (categoryId: string) =>
    groups.flatMap((group) => group.rows).find((row) => row.categoryId === categoryId)!.lineId!

  return {
    ...plan,
    groups,
    moves: [
      {
        id: id(),
        fromLineId: lineOf(sourceId),
        toLineId: lineOf(targetId),
        amount: moved.roundToMinor().toDto(),
        reason: null,
        createdAt: '2026-10-22T09:00:00.000Z',
      },
    ],
    spend: {
      ...plan.spend,
      uncoveredOverspend: tl('0'),
      availableToSpend: plan.spend.poolAvailable,
      availableAtStartOfToday: plan.spend.poolAvailable,
    },
  }
}
