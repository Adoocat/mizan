import type {
  CategoryListResponse,
  GoalDto,
  GoalListResponse,
  GoalResponse,
  PlanResponse,
} from '@mizan/contracts'
import { fixedClock, Money } from '@mizan/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import { accounts, goals, planPeriods, transactions } from '../../db/schema/index.ts'
import { buildTestApp, type TestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import { signUpActor, type Actor } from '../../testing/session.ts'

/**
 * Phase 8's definition of done, over the API: the Goals page shows all three types, and plan
 * savings lines track their contributions (PLAN §20, §9).
 *
 * The clock is pinned to Thursday 22 October 2026, the day the mockups depict, because required
 * monthly and months-left are both functions of what month it is.
 */
const START = '2026-10-01'
const TODAY = '2026-10-22'

let database: Database
let harness: TestApp
let actor: Actor
let category: Record<string, string>
let checking: string

const tl = (amount: string) => ({ amount, currency: 'TRY' as const })
const try_ = (amount: string) => Money.of(amount, 'TRY')

/** `before − amount`, as the API renders it. Money arithmetic, never a float (CLAUDE.md). */
const less = (before: string, amount: string) => try_(before).minus(try_(amount)).toDto().amount

beforeAll(async () => {
  database = connectTestDatabase()
  harness = await buildTestApp(database, { clock: fixedClock(`${TODAY}T09:00:00+03:00`) })
  actor = await signUpActor(harness.app)

  const { groups } = (
    await actor.request({ method: 'GET', url: '/api/v1/categories' })
  ).json<CategoryListResponse>()
  category = Object.fromEntries(
    groups
      .flatMap((group) => group.categories)
      .filter((one) => one.systemKey)
      .map((one) => [one.systemKey!, one.id]),
  )
})

afterAll(async () => {
  await harness?.close()
  await database?.close()
})

beforeEach(async () => {
  await database.db.delete(planPeriods).where(eq(planPeriods.workspaceId, actor.workspaceId))
  await database.db.delete(transactions).where(eq(transactions.workspaceId, actor.workspaceId))
  await database.db.delete(goals).where(eq(goals.workspaceId, actor.workspaceId))
  await database.db.delete(accounts).where(eq(accounts.workspaceId, actor.workspaceId))

  const account = await actor.request({
    method: 'POST',
    url: '/api/v1/accounts',
    payload: { name: 'Garanti', type: 'checking', openingBalance: tl('100000.00') },
  })
  checking = account.json<{ id: string }>().id
})

/* ------------------------------------------------------------------- helpers */

async function createGoal(payload: Record<string, unknown>): Promise<GoalDto> {
  const response = await actor.request({ method: 'POST', url: '/api/v1/goals', payload })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<GoalDto>()
}

async function listGoals(includeArchived = false): Promise<GoalListResponse> {
  const response = await actor.request({
    method: 'GET',
    url: `/api/v1/goals?includeArchived=${includeArchived}`,
  })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<GoalListResponse>()
}

async function readGoal(id: string): Promise<GoalResponse> {
  const response = await actor.request({ method: 'GET', url: `/api/v1/goals/${id}` })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<GoalResponse>()
}

async function contribute(
  id: string,
  amount: string,
  extra: Record<string, unknown> = {},
): Promise<GoalResponse> {
  const response = await actor.request({
    method: 'POST',
    url: `/api/v1/goals/${id}/contributions`,
    payload: { amount: tl(amount), ...extra },
  })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<GoalResponse>()
}

async function allocate(categoryKey: string, amount: string): Promise<void> {
  const response = await actor.request({
    method: 'PUT',
    url: `/api/v1/plans/${START}/lines`,
    payload: { target: 'category', categoryId: category[categoryKey], planned: tl(amount) },
  })
  expect(response.statusCode, response.body).toBe(200)
}

async function readPlan(start = START): Promise<PlanResponse> {
  const response = await actor.request({ method: 'GET', url: `/api/v1/plans/${start}` })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<PlanResponse>()
}

/** Expected income for the month, so what can be spent is a positive number to compare. */
async function expectIncome(amount: string): Promise<void> {
  const response = await actor.request({
    method: 'POST',
    url: `/api/v1/plans/${START}/income-items`,
    payload: { categoryId: category.salary, expected: tl(amount) },
  })
  expect(response.statusCode, response.body).toBe(201)
}

async function allocatePool(amount: string): Promise<void> {
  const response = await actor.request({
    method: 'PUT',
    url: `/api/v1/plans/${START}/lines`,
    payload: { target: 'pool', planned: tl(amount) },
  })
  expect(response.statusCode, response.body).toBe(200)
}

async function spend(
  amount: string,
  categoryKey: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const response = await actor.request({
    method: 'POST',
    url: '/api/v1/transactions',
    payload: {
      type: 'expense',
      date: TODAY,
      accountId: checking,
      parts: [{ categoryId: category[categoryKey], amount: tl(amount), ...extra }],
    },
  })
  expect(response.statusCode, response.body).toBe(201)
}

const SAVINGS_GOAL = {
  type: 'savings',
  name: 'Japan trip',
  target: tl('35000.00'),
  targetDate: '2027-07-15',
} as const

/* -------------------------------------------------------------- the three types */

describe('the three kinds of goal', () => {
  it('creates a savings goal with a target and a date', async () => {
    const goal = await createGoal(SAVINGS_GOAL)

    expect(goal.type).toBe('savings')
    expect(goal.target.amount).toBe('35000.00')
    expect(goal.targetDate).toBe('2027-07-15')
    expect(goal.saved.amount).toBe('0.00')
    expect(goal.remaining.amount).toBe('35000.00')
    // October 2026 to July 2027, counted inclusively (§16).
    expect(goal.monthsLeft).toBe(10)
    expect(goal.requiredMonthly?.amount).toBe('3500.00')
  })

  it('creates a savings goal with no date, and reports no monthly amount for it', async () => {
    const goal = await createGoal({ type: 'savings', name: 'New computer', target: tl('40000.00') })

    expect(goal.targetDate).toBeNull()
    expect(goal.monthsLeft).toBeNull()
    // Decided for this phase: no date means no denominator, so there is nothing to require.
    expect(goal.requiredMonthly).toBeNull()
    expect(goal.status).toBe('neutral')
  })

  it('creates a sinking fund, and refuses one with no due date', async () => {
    const goal = await createGoal({
      type: 'sinking_fund',
      name: 'Kasko insurance',
      target: tl('15000.00'),
      targetDate: '2027-02-10',
      repeat: 'annual',
    })
    expect(goal.repeat).toBe('annual')
    // ₺15,000 over October to February: five months (§9's second example).
    expect(goal.monthsLeft).toBe(5)
    expect(goal.requiredMonthly?.amount).toBe('3000.00')

    const noDate = await actor.request({
      method: 'POST',
      url: '/api/v1/goals',
      payload: { type: 'sinking_fund', name: 'Vergi', target: tl('5000.00') },
    })
    expect(noDate.statusCode).toBe(400)
  })

  it('derives an emergency fund target from the plan, and never stores one', async () => {
    // ₺18,000 rent + ₺3,400 utilities + ₺3,400 groceries of essentials, ₺2,000 of debt.
    await allocate('rent', '18000.00')
    await allocate('utilities', '3400.00')
    await allocate('groceries', '3400.00')
    await allocate('cardPayment', '2000.00')

    const goal = await createGoal({
      type: 'emergency_fund',
      name: 'Emergency fund',
      emergencyMonths: 3,
    })

    // Three months of ₺26,800: essentials and debt together, because a loan does not pause.
    expect(goal.target.amount).toBe('80400.00')
    expect(goal.emergencyMonths).toBe(3)
    const { essentialMonthly } = await listGoals()
    expect(essentialMonthly.amount).toBe('26800.00')
  })

  it('moves an emergency fund target when the plan changes', async () => {
    await allocate('rent', '20000.00')
    const goal = await createGoal({
      type: 'emergency_fund',
      name: 'Emergency fund',
      emergencyMonths: 6,
    })
    expect(goal.target.amount).toBe('120000.00')

    // The rent goes up: the fund you need goes up with it, with no edit to the goal.
    await allocate('rent', '22000.00')
    const after = (await readGoal(goal.id)).goal
    expect(after.target.amount).toBe('132000.00')
  })

  it('reports emergency cover in months, the §16 figure', async () => {
    await allocate('rent', '24800.00')
    const goal = await createGoal({
      type: 'emergency_fund',
      name: 'Emergency fund',
      emergencyMonths: 6,
    })
    await contribute(goal.id, '82000.00')

    // ₺82,000 against ₺24,800 of essentials: 3.3 months.
    expect((await readGoal(goal.id)).goal.coverageMonths).toBe('3.3')
  })

  it('refuses a target on an emergency fund, whose target is derived', async () => {
    const goal = await createGoal({
      type: 'emergency_fund',
      name: 'Emergency fund',
      emergencyMonths: 3,
    })
    const response = await actor.request({
      method: 'PATCH',
      url: `/api/v1/goals/${goal.id}`,
      payload: { target: tl('100000.00') },
    })
    expect(response.statusCode).toBe(400)
    expect(response.body).toContain('essentials')
  })
})

/* ------------------------------------------------------------- contributions */

describe('contributing', () => {
  it('earmarks money and moves the goal forward', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    const { goal: after, contributions } = await contribute(goal.id, '24500.00')

    expect(after.saved.amount).toBe('24500.00')
    expect(after.remaining.amount).toBe('10500.00')
    expect(after.progress).toBe('0.700000')
    expect(contributions).toHaveLength(1)
    expect(contributions[0]!.source).toBe('manual')
    expect(contributions[0]!.date).toBe(TODAY)
  })

  it('releases money back, as a negative contribution', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    await contribute(goal.id, '5000.00')
    const { goal: after } = await contribute(goal.id, '-2000.00')

    expect(after.saved.amount).toBe('3000.00')
    expect(after.earmarked.amount).toBe('3000.00')
  })

  it('refuses releasing more than the goal holds', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    await contribute(goal.id, '5000.00')

    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/contributions`,
      payload: { amount: tl('-5001.00') },
    })
    expect(response.statusCode).toBe(409)
  })

  it('allows a goal to be funded past its target', async () => {
    // Decided for this phase: over-funding is information, not an error.
    const goal = await createGoal(SAVINGS_GOAL)
    const { goal: after } = await contribute(goal.id, '40000.00')

    expect(after.saved.amount).toBe('40000.00')
    expect(after.remaining.amount).toBe('0.00')
    expect(after.status).toBe('funded')
    expect(after.requiredMonthly?.amount).toBe('0.00')
  })

  it('is idempotent on a client-supplied id', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    const id = '019a2c1e-0000-7000-8000-00000000c001'

    await contribute(goal.id, '1000.00', { id })
    const { goal: after, contributions } = await contribute(goal.id, '1000.00', { id })

    expect(contributions).toHaveLength(1)
    expect(after.saved.amount).toBe('1000.00')
  })

  it('links a transfer to the goal, and records that it came from one', async () => {
    const savings = await actor.request({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: 'Savings', type: 'savings' },
    })
    const transfer = await actor.request({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        type: 'transfer',
        date: TODAY,
        fromAccountId: checking,
        toAccountId: savings.json<{ id: string }>().id,
        amount: tl('3000.00'),
      },
    })
    expect(transfer.statusCode, transfer.body).toBe(201)

    const goal = await createGoal(SAVINGS_GOAL)
    const { contributions } = await contribute(goal.id, '3000.00', {
      transactionId: transfer.json<{ id: string }>().id,
    })

    expect(contributions[0]!.source).toBe('transfer')
    expect(contributions[0]!.transactionId).toBe(transfer.json<{ id: string }>().id)
  })

  it('undoes a contribution', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    const { contributions } = await contribute(goal.id, '5000.00')

    const response = await actor.request({
      method: 'DELETE',
      url: `/api/v1/goals/${goal.id}/contributions/${contributions[0]!.id}`,
    })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<GoalResponse>().goal.saved.amount).toBe('0.00')
  })

  it('refuses a contribution to an archived goal', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    await actor.request({ method: 'POST', url: `/api/v1/goals/${goal.id}/archive` })

    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/contributions`,
      payload: { amount: tl('100.00') },
    })
    expect(response.statusCode).toBe(409)
  })
})

/* ------------------------------------------------------ goal-funded spending */

describe('spending from a goal', () => {
  it('draws the goal down instead of this month’s plan (§9)', async () => {
    const goal = await createGoal({
      type: 'sinking_fund',
      name: 'Kasko insurance',
      target: tl('15000.00'),
      targetDate: '2026-10-28',
    })
    await contribute(goal.id, '15000.00')

    await spend('14200.00', 'insurance', { goalId: goal.id })

    const after = (await readGoal(goal.id)).goal
    expect(after.spent.amount).toBe('14200.00')
    expect(after.saved.amount).toBe('800.00')
  })

  it('keeps goal-funded spending out of available to spend', async () => {
    await expectIncome('46000.00')
    await allocate('rent', '20000.00')
    await allocatePool('9000.00')

    const goal = await createGoal({
      type: 'sinking_fund',
      name: 'Kasko insurance',
      target: tl('15000.00'),
      targetDate: '2026-10-28',
    })
    /*
     * Earmarked in **September**, which is the whole point of a sinking fund: the money was set
     * aside out of an earlier month's plan, so it is not October's to spend and never was. An
     * earmark made this month would come off this month's figure instead — correctly, and that
     * case is covered below.
     */
    await contribute(goal.id, '15000.00', { date: '2026-09-15' })

    const before = (await readPlan()).spend.availableToSpend.amount
    expect(try_(before).isPositive()).toBe(true)

    // ₺14,200 of insurance, funded from the goal. The money was earmarked in earlier months, so
    // this month's figure must not move at all — which is what makes a sinking fund work.
    await spend('14200.00', 'insurance', { goalId: goal.id })
    expect((await readPlan()).spend.availableToSpend.amount).toBe(before)

    // The same expense without the goal comes off the plan, as spending the plan never allocated.
    await spend('1000.00', 'insurance')
    expect((await readPlan()).spend.availableToSpend.amount).toBe(less(before, '1000.00'))
  })

  it('returns the money to the goal when the expense is deleted', async () => {
    const goal = await createGoal({
      type: 'sinking_fund',
      name: 'Kasko insurance',
      target: tl('15000.00'),
      targetDate: '2026-10-28',
    })
    await contribute(goal.id, '15000.00')

    const expense = await actor.request({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        type: 'expense',
        date: TODAY,
        accountId: checking,
        parts: [{ categoryId: category.insurance, amount: tl('14200.00'), goalId: goal.id }],
      },
    })
    expect(expense.statusCode, expense.body).toBe(201)
    expect((await readGoal(goal.id)).goal.saved.amount).toBe('800.00')

    // Deriving the goal's balance from the ledger is what makes undo put the money back.
    await actor.request({
      method: 'DELETE',
      url: `/api/v1/transactions/${expense.json<{ id: string }>().id}`,
    })
    expect((await readGoal(goal.id)).goal.saved.amount).toBe('15000.00')
  })

  it('refuses to fund spending from an archived goal', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    await actor.request({ method: 'POST', url: `/api/v1/goals/${goal.id}/archive` })

    const response = await actor.request({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        type: 'expense',
        date: TODAY,
        accountId: checking,
        parts: [{ categoryId: category.shopping, amount: tl('100.00'), goalId: goal.id }],
      },
    })
    expect(response.statusCode).toBe(409)
  })
})

/* ------------------------------------------------------------ in the plan */

describe('goals in the plan', () => {
  it('adds a goal to the plan at what it needs each month', async () => {
    const goal = await createGoal(SAVINGS_GOAL)

    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/plan-line`,
      payload: { start: START },
    })
    expect(response.statusCode, response.body).toBe(200)

    const after = response.json<GoalResponse>().goal
    // The ₺3,500 it needs each month, without the user typing it again.
    expect(after.plannedMonthly?.amount).toBe('3500.00')
    expect(after.planLineId).not.toBeNull()
  })

  it('tracks contributions against the goal line (phase 8 definition of done)', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/plan-line`,
      payload: { start: START, planned: tl('4000.00') },
    })
    await contribute(goal.id, '2500.00')

    const plan = await readPlan()
    const group = plan.groups.find((one) => one.kind === 'goals')
    expect(group).toBeDefined()

    const row = group!.rows[0]!
    expect(row.target).toBe('goal')
    expect(row.goalId).toBe(goal.id)
    expect(row.planned.amount).toBe('4000.00')
    // A goal line's actual is the contributions to it this month (§10).
    expect(row.actual.amount).toBe('2500.00')
    expect(row.available.amount).toBe('1500.00')
    expect(plan.summary.allocated.amount).toBe('4000.00')
  })

  it('counts a goal allocation as allocated money, which leaves less unassigned', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    const incomeCategory = category.salary!
    await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/income-items`,
      payload: { categoryId: incomeCategory, expected: tl('46000.00') },
    })

    const before = (await readPlan()).summary.unassigned.amount
    expect(before).toBe('46000.00')

    await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/plan-line`,
      payload: { start: START, planned: tl('3500.00') },
    })
    expect((await readPlan()).summary.unassigned.amount).toBe('42500.00')
  })

  it('treats contributing more than planned as an overspend on the goal line', async () => {
    await expectIncome('46000.00')
    const goal = await createGoal(SAVINGS_GOAL)
    await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/plan-line`,
      payload: { start: START, planned: tl('3500.00') },
    })
    await allocatePool('9000.00')

    const before = (await readPlan()).spend.availableToSpend.amount
    expect(try_(before).greaterThan(try_('1500.00'))).toBe(true)
    // ₺5,000 into a goal the plan gave ₺3,500: ₺1,500 more has left than was planned, so there
    // is ₺1,500 less to spend (decision D4).
    await contribute(goal.id, '5000.00')

    const plan = await readPlan()
    expect(plan.spend.uncoveredOverspend.amount).toBe('1500.00')
    expect(plan.spend.availableToSpend.amount).toBe(less(before, '1500.00'))
  })

  it('reads the goal as behind when its line is smaller than it needs', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/plan-line`,
      payload: { start: START, planned: tl('1000.00') },
    })

    const after = (await readGoal(goal.id)).goal
    expect(after.status).toBe('behind')
    // At ₺1,000 a month it takes 35 more months, which is where the projection lands.
    expect(after.projectedFinish).toBe('2029-08-01')
  })

  it('refuses to add a goal with no target date to the plan without an amount', async () => {
    const goal = await createGoal({ type: 'savings', name: 'New computer', target: tl('40000.00') })

    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/plan-line`,
      payload: { start: START },
    })
    expect(response.statusCode).toBe(400)
    expect(response.body).toContain('no target date')
  })

  it('leaves goals with nothing allocated out of the plan entirely', async () => {
    await createGoal(SAVINGS_GOAL)
    const plan = await readPlan()
    // "Add to plan" is what puts a goal on the plan; listing every goal would fill the page.
    expect(plan.groups.find((one) => one.kind === 'goals')).toBeUndefined()
  })
})

/* ------------------------------------------------------------- over-earmarking */

describe('over-earmarking', () => {
  it('warns when a goal earmarks more than its account holds, and never refuses it', async () => {
    const goal = await createGoal({ ...SAVINGS_GOAL, keptInAccountId: checking })
    // The account holds ₺100,000; this earmarks ₺120,000 of it.
    await contribute(goal.id, '120000.00')

    const { overEarmarked } = await listGoals()
    expect(overEarmarked).toHaveLength(1)
    expect(overEarmarked[0]!.accountId).toBe(checking)
    expect(overEarmarked[0]!.excess.amount).toBe('20000.00')
  })

  it('says nothing when every earmark is backed', async () => {
    const goal = await createGoal({ ...SAVINGS_GOAL, keptInAccountId: checking })
    await contribute(goal.id, '30000.00')

    expect((await listGoals()).overEarmarked).toEqual([])
  })

  it('stops warning once the goal is archived', async () => {
    const goal = await createGoal({ ...SAVINGS_GOAL, keptInAccountId: checking })
    await contribute(goal.id, '120000.00')
    await actor.request({ method: 'POST', url: `/api/v1/goals/${goal.id}/archive` })

    expect((await listGoals(true)).overEarmarked).toEqual([])
  })
})

/* ------------------------------------------------------------------ the list */

describe('the Goals page', () => {
  it('shows the three types together with what they hold', async () => {
    await allocate('rent', '24800.00')
    const emergency = await createGoal({
      type: 'emergency_fund',
      name: 'Emergency fund',
      emergencyMonths: 3,
    })
    const japan = await createGoal(SAVINGS_GOAL)
    const insurance = await createGoal({
      type: 'sinking_fund',
      name: 'Kasko insurance',
      target: tl('15000.00'),
      targetDate: '2027-02-10',
    })

    await contribute(emergency.id, '50000.00')
    await contribute(japan.id, '24500.00')
    await contribute(insurance.id, '3000.00')

    const list = await listGoals()
    expect(list.goals.map((one) => one.type).sort()).toEqual([
      'emergency_fund',
      'savings',
      'sinking_fund',
    ])
    expect(list.totalSaved.amount).toBe('77500.00')
    // ₺74,400 of emergency fund + ₺35,000 + ₺15,000.
    expect(list.totalTarget.amount).toBe('124400.00')
  })

  it('hides archived goals unless they are asked for', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    await actor.request({ method: 'POST', url: `/api/v1/goals/${goal.id}/archive` })

    expect((await listGoals()).goals).toHaveLength(0)
    const archived = await listGoals(true)
    expect(archived.goals).toHaveLength(1)
    expect(archived.goals[0]!.archivedAt).not.toBeNull()
  })

  it('keeps contributions as history when a goal is archived, and brings them back', async () => {
    const goal = await createGoal(SAVINGS_GOAL)
    await contribute(goal.id, '5000.00')
    await actor.request({ method: 'POST', url: `/api/v1/goals/${goal.id}/archive` })

    expect((await readGoal(goal.id)).contributions).toHaveLength(1)

    const back = await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/unarchive`,
    })
    expect(back.statusCode, back.body).toBe(200)
    expect(back.json<GoalDto>().saved.amount).toBe('5000.00')
  })

  it('is idempotent on a client-supplied id', async () => {
    const id = '019a2c1e-0000-7000-8000-00000000a001'
    await createGoal({ ...SAVINGS_GOAL, id })

    const again = await actor.request({
      method: 'POST',
      url: '/api/v1/goals',
      payload: { ...SAVINGS_GOAL, id },
    })
    expect(again.statusCode).toBe(200)
    expect((await listGoals()).goals).toHaveLength(1)
  })

  it('refuses a goal kept in another workspace’s account', async () => {
    const stranger = await signUpActor(harness.app, { name: 'Stranger' })
    const theirs = await stranger.request({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: 'Theirs', type: 'checking' },
    })

    const response = await actor.request({
      method: 'POST',
      url: '/api/v1/goals',
      payload: { ...SAVINGS_GOAL, keptInAccountId: theirs.json<{ id: string }>().id },
    })
    expect(response.statusCode).toBe(404)
  })
})
