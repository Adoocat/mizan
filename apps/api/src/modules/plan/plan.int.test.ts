import { moneyFromDto } from '@mizan/contracts'
import type {
  CategoryListResponse,
  CopyPlanResponse,
  PlanGroupDto,
  PlanResponse,
  PlanRowDto,
} from '@mizan/contracts'
import { Money } from '@mizan/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import { accounts, planPeriods, transactions } from '../../db/schema/index.ts'
import { buildTestApp, type TestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import { signUpActor, type Actor } from '../../testing/session.ts'

/** The month the mockups depict, which is also the month these tests plan. */
const START = '2026-10-01'
const SEPTEMBER = '2026-09-01'

let database: Database
let harness: TestApp
let actor: Actor
/** The seeded categories, by system key. */
let category: Record<string, string>
let checking: string

beforeAll(async () => {
  database = connectTestDatabase()
  harness = await buildTestApp(database)
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

/** A clean slate per test: these tests sum a whole workspace. */
beforeEach(async () => {
  await database.db.delete(planPeriods).where(eq(planPeriods.workspaceId, actor.workspaceId))
  await database.db.delete(transactions).where(eq(transactions.workspaceId, actor.workspaceId))
  await database.db.delete(accounts).where(eq(accounts.workspaceId, actor.workspaceId))
  checking = await newAccount('Garanti BBVA')
})

const tl = (amount: string) => ({ amount, currency: 'TRY' as const })

async function newAccount(
  name: string,
  { type = 'checking', opening = '0.00', onBudget = true } = {},
): Promise<string> {
  const response = await actor.request({
    method: 'POST',
    url: '/api/v1/accounts',
    payload: { name, type, onBudget, openingBalance: tl(opening) },
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<{ id: string }>().id
}

async function readPlan(start = START): Promise<PlanResponse> {
  const response = await actor.request({ method: 'GET', url: `/api/v1/plans/${start}` })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<PlanResponse>()
}

async function allocate(
  categoryKey: string,
  amount: string,
  { start = START, rollover }: { start?: string; rollover?: boolean } = {},
): Promise<PlanResponse> {
  const response = await actor.request({
    method: 'PUT',
    url: `/api/v1/plans/${start}/lines`,
    payload: {
      target: 'category',
      categoryId: category[categoryKey],
      planned: tl(amount),
      ...(rollover === undefined ? {} : { rollover }),
    },
  })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<PlanResponse>()
}

async function allocatePool(amount: string, start = START): Promise<PlanResponse> {
  const response = await actor.request({
    method: 'PUT',
    url: `/api/v1/plans/${start}/lines`,
    payload: { target: 'pool', planned: tl(amount) },
  })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<PlanResponse>()
}

async function expectIncome(
  categoryKey: string,
  amount: string,
  { start = START, date }: { start?: string; date?: string } = {},
): Promise<string> {
  const response = await actor.request({
    method: 'POST',
    url: `/api/v1/plans/${start}/income-items`,
    payload: {
      categoryId: category[categoryKey],
      expected: tl(amount),
      ...(date ? { expectedDate: date } : {}),
    },
  })
  expect(response.statusCode, response.body).toBe(201)
  const plan = response.json<PlanResponse>()
  return plan.incomeItems.at(-1)!.id
}

async function spend(
  categoryKey: string | null,
  amount: string,
  { date = '2026-10-10', account = checking, type = 'expense' } = {},
): Promise<void> {
  const response = await actor.request({
    method: 'POST',
    url: '/api/v1/transactions',
    payload: {
      type,
      date,
      accountId: account,
      parts: [
        {
          ...(categoryKey === null ? {} : { categoryId: category[categoryKey] }),
          amount: tl(amount),
        },
      ],
    },
  })
  expect(response.statusCode, response.body).toBe(201)
}

const group = (plan: PlanResponse, kind: PlanGroupDto['kind']): PlanGroupDto => {
  const found = plan.groups.find((one) => one.kind === kind)
  if (!found) throw new Error(`no ${kind} group in the plan`)
  return found
}

const rowFor = (plan: PlanResponse, categoryKey: string): PlanRowDto => {
  const rows = plan.groups.flatMap((one) => one.rows)
  const found = rows.find((row) => row.categoryId === category[categoryKey])
  if (!found) throw new Error(`no row for ${categoryKey}`)
  return found
}

const poolRow = (plan: PlanResponse): PlanRowDto => group(plan, 'pool').rows[0]!

/* ------------------------------------------------------------ the period */

describe('a plan period', () => {
  it('is served for the current month without having been created', async () => {
    const response = await actor.request({ method: 'GET', url: '/api/v1/plans/current' })
    expect(response.statusCode, response.body).toBe(200)
    const plan = response.json<PlanResponse>()

    // Nothing is stored until the first edit, but the month is still a month.
    expect(plan.period.id).toBeNull()
    expect(plan.period.status).toBe('open')
    expect(plan.summary.allocated).toEqual(tl('0.00'))
    expect(plan.groups.length).toBeGreaterThan(0)
  })

  it('reports its own bounds and its neighbours', async () => {
    const plan = await readPlan()
    expect(plan.period.start).toBe('2026-10-01')
    expect(plan.period.end).toBe('2026-11-01')
    expect(plan.period.previousStart).toBe('2026-09-01')
    expect(plan.period.nextStart).toBe('2026-11-01')
    expect(plan.period.days).toBe(31)
  })

  it('is written the first time something is allocated', async () => {
    expect((await readPlan()).period.id).toBeNull()
    await allocate('rent', '9500')
    expect((await readPlan()).period.id).not.toBeNull()
  })

  it('refuses a start date that is not a plan month', async () => {
    const response = await actor.request({ method: 'GET', url: '/api/v1/plans/2026-10-17' })
    expect(response.statusCode).toBe(400)
  })

  it('follows the workspace period start day', async () => {
    await actor.request({
      method: 'PATCH',
      url: '/api/v1/workspace/settings',
      payload: { periodStartDay: 15 },
    })

    const plan = await readPlan('2026-10-15')
    expect(plan.period.start).toBe('2026-10-15')
    expect(plan.period.end).toBe('2026-11-15')
    expect(plan.period.previousStart).toBe('2026-09-15')
    expect((await actor.request({ method: 'GET', url: `/api/v1/plans/${START}` })).statusCode).toBe(
      400,
    )

    await actor.request({
      method: 'PATCH',
      url: '/api/v1/workspace/settings',
      payload: { periodStartDay: 1 },
    })
  })

  it('keeps the bounds a planned month was planned with when payday moves', async () => {
    await allocate('rent', '9500')

    await actor.request({
      method: 'PATCH',
      url: '/api/v1/workspace/settings',
      payload: { periodStartDay: 15 },
    })

    // October was planned on the old anchor, so it is still 1 Oct – 1 Nov.
    const plan = await readPlan()
    expect(plan.period.start).toBe('2026-10-01')
    expect(plan.period.end).toBe('2026-11-01')
    expect(plan.summary.allocated).toEqual(tl('9500.00'))

    await actor.request({
      method: 'PATCH',
      url: '/api/v1/workspace/settings',
      payload: { periodStartDay: 1 },
    })
  })
})

/* -------------------------------------------------------- the golden plan */

describe('the 50,000 plan from the mockups', () => {
  /** Allocations and spending exactly as `design/new-design/Plan.dc.html` shows them. */
  async function buildGoldenPlan() {
    await expectIncome('salary', '46000', { date: '2026-10-01' })
    await expectIncome('freelance', '4000', { date: '2026-10-15' })

    // Planned expenses: 27,000 across essentials, flexible spending and debt.
    await allocate('rent', '9500')
    await allocate('groceries', '6000')
    await allocate('utilities', '1400')
    await allocate('internet', '600')
    await allocate('transport', '1800')
    await allocate('subscriptions', '700')
    await allocate('personalCare', '500')
    await allocate('education', '1000')
    await allocate('cardPayment', '4200')
    await allocate('loanPayment', '1300')
    // Savings 6,000 and investments 8,000.
    await allocate('savingsTransfer', '6000')
    await allocate('investmentContribution', '8000')
    // Available to spend: 9,000.
    await allocatePool('9000')

    await spend('rent', '9500', { date: '2026-10-05' })
    await spend('groceries', '4850')
    await spend('utilities', '1070')
    await spend('transport', '1420')
    await spend('subscriptions', '379')
    await spend('personalCare', '610')
    await spend('cardPayment', '4200', { date: '2026-10-10' })
    await spend('loanPayment', '1300', { date: '2026-10-12' })
    await spend('savingsTransfer', '6000', { date: '2026-10-01' })
    await spend('investmentContribution', '4000', { date: '2026-10-15' })
    // Pooled spending: flexible categories with no line of their own.
    await spend('diningOut', '2850')
    await spend('shopping', '1900')
    await spend('entertainment', '750')
    await spend('other', '500')

    return readPlan()
  }

  it('reproduces 27,000 / 6,000 / 8,000 / 9,000 with nothing unassigned', async () => {
    const plan = await buildGoldenPlan()

    const expenses = Money.sum(
      (['essential', 'flexible', 'debt'] as const).map((kind) =>
        moneyFromDto(group(plan, kind).planned),
      ),
      'TRY',
    )

    expect(expenses.toDto()).toEqual(tl('27000.00'))
    expect(group(plan, 'savings').planned).toEqual(tl('6000.00'))
    expect(group(plan, 'investment').planned).toEqual(tl('8000.00'))
    expect(group(plan, 'pool').planned).toEqual(tl('9000.00'))

    expect(plan.summary.income).toEqual(tl('50000.00'))
    expect(plan.summary.allocated).toEqual(tl('50000.00'))
    expect(plan.summary.unassigned).toEqual(tl('0.00'))
  })

  it('leaves the pool 3,000 of its 9,000 after the pooled categories spend 6,000', async () => {
    const plan = await buildGoldenPlan()
    const pool = poolRow(plan)

    expect(pool.actual).toEqual(tl('6000.00'))
    expect(pool.available).toEqual(tl('3000.00'))
  })

  it('counts a flexible category with its own line against that line, not the pool', async () => {
    const plan = await buildGoldenPlan()

    // Subscriptions has a line, so its 379 is its own; dining out has none and is pooled.
    expect(rowFor(plan, 'subscriptions').coveredBy).toBeNull()
    expect(rowFor(plan, 'subscriptions').actual).toEqual(tl('379.00'))
    expect(rowFor(plan, 'diningOut').coveredBy).toBe('pool')
    expect(rowFor(plan, 'diningOut').actual).toEqual(tl('2850.00'))
    // A pooled row carries no remainder of its own: the pool answers for it.
    expect(rowFor(plan, 'diningOut').available).toEqual(tl('0.00'))
  })

  it('surfaces the one overspent line without letting its group hide it', async () => {
    const plan = await buildGoldenPlan()
    const flexible = group(plan, 'flexible')

    expect(rowFor(plan, 'personalCare').available).toEqual(tl('-110.00'))
    expect(rowFor(plan, 'personalCare').overspend).toEqual(tl('110.00'))
    // The group still has money left, and is still 110 overspent.
    expect(moneyFromDto(flexible.available).isPositive()).toBe(true)
    expect(flexible.overspend).toEqual(tl('110.00'))
    expect(plan.summary.overspend).toEqual(tl('110.00'))
  })

  it('counts every lira of spending exactly once', async () => {
    const plan = await buildGoldenPlan()
    // 9500 + 4850 + 1070 + 1420 + 379 + 610 + 4200 + 1300 + 6000 + 4000 + 6000 pooled.
    expect(plan.summary.spent).toEqual(tl('39329.00'))
  })
})

/* ------------------------------------------------------------- allocations */

describe('editing an allocation', () => {
  it('creates the line on the first write and updates it after', async () => {
    const created = await allocate('groceries', '6000')
    expect(rowFor(created, 'groceries').planned).toEqual(tl('6000.00'))
    expect(rowFor(created, 'groceries').version).toBe(1)

    const updated = await allocate('groceries', '6500')
    expect(rowFor(updated, 'groceries').planned).toEqual(tl('6500.00'))
    expect(rowFor(updated, 'groceries').version).toBe(2)
  })

  it('hands a flexible category back to the pool when the amount is cleared', async () => {
    await spend('diningOut', '2850')
    const planned = await allocate('diningOut', '2600')
    expect(rowFor(planned, 'diningOut').coveredBy).toBeNull()
    expect(poolRow(planned).actual).toEqual(tl('0.00'))

    const cleared = await allocate('diningOut', '0')
    expect(rowFor(cleared, 'diningOut').lineId).toBeNull()
    expect(rowFor(cleared, 'diningOut').coveredBy).toBe('pool')
    expect(poolRow(cleared).actual).toEqual(tl('2850.00'))
  })

  it('refuses a write built on a stale version', async () => {
    const created = await allocate('groceries', '6000')
    const version = rowFor(created, 'groceries').version!
    await allocate('groceries', '6500')

    const response = await actor.request({
      method: 'PUT',
      url: `/api/v1/plans/${START}/lines`,
      payload: {
        target: 'category',
        categoryId: category.groceries,
        planned: tl('7000'),
        version,
      },
    })
    expect(response.statusCode).toBe(409)
    expect((await readPlan()).summary.allocated).toEqual(tl('6500.00'))
  })

  it('keeps a rollover flag on the line', async () => {
    const plan = await allocate('groceries', '6000', { rollover: true })
    expect(rowFor(plan, 'groceries').rollover).toBe(true)
  })

  it('refuses a negative allocation', async () => {
    const response = await actor.request({
      method: 'PUT',
      url: `/api/v1/plans/${START}/lines`,
      payload: { target: 'category', categoryId: category.groceries, planned: tl('-100') },
    })
    expect(response.statusCode).toBe(400)
  })

  it('refuses an allocation to an income category', async () => {
    const response = await actor.request({
      method: 'PUT',
      url: `/api/v1/plans/${START}/lines`,
      payload: { target: 'category', categoryId: category.salary, planned: tl('46000') },
    })
    expect(response.statusCode).toBe(400)
  })

  it('refuses a goal line until goals exist', async () => {
    const response = await actor.request({
      method: 'PUT',
      url: `/api/v1/plans/${START}/lines`,
      payload: { target: 'goal', planned: tl('1000') },
    })
    expect(response.statusCode).toBe(400)
  })

  it('refuses an allocation to an archived category', async () => {
    const created = await actor.request({
      method: 'POST',
      url: '/api/v1/categories',
      payload: {
        groupId: (
          await actor.request({ method: 'GET', url: '/api/v1/categories' })
        ).json<CategoryListResponse>().groups[1]!.id,
        name: 'Temporary',
      },
    })
    const id = created.json<{ id: string }>().id
    await actor.request({ method: 'POST', url: `/api/v1/categories/${id}/archive` })

    const response = await actor.request({
      method: 'PUT',
      url: `/api/v1/plans/${START}/lines`,
      payload: { target: 'category', categoryId: id, planned: tl('100') },
    })
    expect(response.statusCode).toBe(409)
  })
})

/* ----------------------------------------------------------------- actuals */

describe('what counts as actual', () => {
  it('ignores an opening balance and a reconciliation', async () => {
    const funded = await newAccount('Cash', { type: 'cash', opening: '5000.00' })
    await actor.request({
      method: 'POST',
      url: `/api/v1/accounts/${funded}/reconcile`,
      payload: { statementBalance: tl('4800.00'), date: '2026-10-11' },
    })

    const plan = await readPlan()
    expect(plan.summary.spent).toEqual(tl('0.00'))
    expect(plan.summary.uncategorizedSpending).toEqual(tl('0.00'))
  })

  it('ignores spending on an off-budget account', async () => {
    const offBudget = await newAccount('Brokerage', { type: 'savings', onBudget: false })
    await allocate('groceries', '6000')
    await spend('groceries', '500', { account: offBudget })

    expect(rowFor(await readPlan(), 'groceries').actual).toEqual(tl('0.00'))
  })

  it('ignores spending dated outside the period', async () => {
    await allocate('groceries', '6000')
    await spend('groceries', '400', { date: '2026-09-30' })
    await spend('groceries', '300', { date: '2026-11-01' })
    await spend('groceries', '200', { date: '2026-10-31' })

    expect(rowFor(await readPlan(), 'groceries').actual).toEqual(tl('200.00'))
  })

  it('takes a refund off the spending of its category', async () => {
    await allocate('groceries', '6000')
    await spend('groceries', '1200')
    await spend('groceries', '200', { type: 'income' })

    const row = rowFor(await readPlan(), 'groceries')
    expect(row.actual).toEqual(tl('1000.00'))
    expect(row.available).toEqual(tl('5000.00'))
  })

  it('leaves a transfer between two on-budget accounts out of the plan', async () => {
    const savings = await newAccount('Savings', { type: 'savings' })
    await actor.request({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        type: 'transfer',
        date: '2026-10-10',
        fromAccountId: checking,
        toAccountId: savings,
        amount: tl('3000.00'),
      },
    })

    const plan = await readPlan()
    expect(plan.summary.spent).toEqual(tl('0.00'))
    expect(plan.summary.uncategorizedSpending).toEqual(tl('0.00'))
  })

  it('counts a transfer that leaves the budget against its category', async () => {
    const brokerage = await newAccount('Brokerage', { type: 'savings', onBudget: false })
    await allocate('investmentContribution', '8000')
    await actor.request({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        type: 'transfer',
        date: '2026-10-15',
        fromAccountId: checking,
        toAccountId: brokerage,
        amount: tl('4000.00'),
        categoryId: category.investmentContribution,
      },
    })

    const row = rowFor(await readPlan(), 'investmentContribution')
    expect(row.actual).toEqual(tl('4000.00'))
    expect(row.available).toEqual(tl('4000.00'))
  })

  it('puts spending with no category on the pool', async () => {
    /*
     * An on-budget expense must carry a category (§10), so the only way a line ends up
     * uncategorized is an account that was outside the budget when it was recorded — or, from
     * v1.1, a CSV import. Either way the pool is what answers for it.
     */
    await allocatePool('9000')
    const wallet = await newAccount('Wallet', { type: 'cash', onBudget: false })
    await spend(null, '318.75', { account: wallet })
    await actor.request({
      method: 'PATCH',
      url: `/api/v1/accounts/${wallet}`,
      payload: { onBudget: true },
    })

    const plan = await readPlan()
    expect(plan.summary.uncategorizedSpending).toEqual(tl('318.75'))
    expect(poolRow(plan).actual).toEqual(tl('318.75'))
    expect(poolRow(plan).available).toEqual(tl('8681.25'))
  })

  it('ignores a soft-deleted transaction', async () => {
    await allocate('groceries', '6000')
    const created = await actor.request({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        type: 'expense',
        date: '2026-10-10',
        accountId: checking,
        parts: [{ categoryId: category.groceries, amount: tl('500.00') }],
      },
    })
    const id = created.json<{ id: string }>().id
    expect(rowFor(await readPlan(), 'groceries').actual).toEqual(tl('500.00'))

    await actor.request({ method: 'DELETE', url: `/api/v1/transactions/${id}` })
    expect(rowFor(await readPlan(), 'groceries').actual).toEqual(tl('0.00'))
  })
})

/* ----------------------------------------------------------- subcategories */

describe('subcategories', () => {
  let market: string

  beforeEach(async () => {
    const { groups } = (
      await actor.request({ method: 'GET', url: '/api/v1/categories' })
    ).json<CategoryListResponse>()
    const essentials = groups.find((one) => one.kind === 'essential')!

    const created = await actor.request({
      method: 'POST',
      url: '/api/v1/categories',
      payload: { groupId: essentials.id, parentId: category.groceries, name: 'Market' },
    })
    expect(created.statusCode, created.body).toBe(201)
    market = created.json<{ id: string }>().id
  })

  const child = (plan: PlanResponse): PlanRowDto['children'][number] => {
    const parent = plan.groups
      .flatMap((one) => one.rows)
      .find((row) => row.categoryId === category.groceries)!
    return parent.children.find((one) => one.categoryId === market)!
  }

  it('counts a subcategory without a line on its parent', async () => {
    await allocate('groceries', '6000')
    await actor.request({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        type: 'expense',
        date: '2026-10-10',
        accountId: checking,
        parts: [{ categoryId: market, amount: tl('850.00') }],
      },
    })

    const plan = await readPlan()
    expect(rowFor(plan, 'groceries').actual).toEqual(tl('850.00'))
    expect(child(plan).coveredBy).toBe('parent')
    // The parent carries the remainder, so the child shows none of its own.
    expect(child(plan).available).toEqual(tl('0.00'))
    expect(plan.summary.spent).toEqual(tl('850.00'))
  })

  it('detaches a subcategory from its parent once it has its own line', async () => {
    await allocate('groceries', '6000')
    await actor.request({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        type: 'expense',
        date: '2026-10-10',
        accountId: checking,
        parts: [{ categoryId: market, amount: tl('850.00') }],
      },
    })
    await actor.request({
      method: 'PUT',
      url: `/api/v1/plans/${START}/lines`,
      payload: { target: 'category', categoryId: market, planned: tl('1000.00') },
    })

    const plan = await readPlan()
    expect(rowFor(plan, 'groceries').actual).toEqual(tl('0.00'))
    expect(child(plan).coveredBy).toBeNull()
    expect(child(plan).available).toEqual(tl('150.00'))
    // 6,000 for groceries and 1,000 for the subcategory.
    expect(plan.summary.allocated).toEqual(tl('7000.00'))
    expect(plan.summary.spent).toEqual(tl('850.00'))
  })
})

/* ------------------------------------------------------------------ income */

describe('expected income', () => {
  it('counts its expectation until the money arrives', async () => {
    await expectIncome('salary', '46000', { date: '2026-10-01' })
    expect((await readPlan()).summary.income).toEqual(tl('46000.00'))

    // Half of it lands: the plan keeps expecting the rest.
    await spend('salary', '23000', { type: 'income', date: '2026-10-01' })
    expect((await readPlan()).summary.income).toEqual(tl('46000.00'))
  })

  it('switches to the actual amount once more than expected arrives', async () => {
    await expectIncome('salary', '46000', { date: '2026-10-01' })
    await spend('salary', '49500', { type: 'income', date: '2026-10-01' })

    const plan = await readPlan()
    expect(plan.summary.income).toEqual(tl('49500.00'))
    expect(plan.summary.unplannedIncome).toEqual(tl('3500.00'))
  })

  it('counts a confirmed item at what was confirmed, over-allocating the plan', async () => {
    const id = await expectIncome('salary', '50000', { date: '2026-10-01' })
    await allocate('rent', '9500')
    await allocatePool('40500')
    expect((await readPlan()).summary.unassigned).toEqual(tl('0.00'))

    // Payday: 48,000 arrived, not 50,000 (flow F2).
    await spend('salary', '48000', { type: 'income', date: '2026-10-01' })
    const response = await actor.request({
      method: 'PATCH',
      url: `/api/v1/plans/${START}/income-items/${id}`,
      payload: { received: tl('48000.00') },
    })
    expect(response.statusCode, response.body).toBe(200)

    const plan = response.json<PlanResponse>()
    expect(plan.summary.income).toEqual(tl('48000.00'))
    expect(plan.summary.unassigned).toEqual(tl('-2000.00'))
    expect(plan.incomeItems[0]!.received).toEqual(tl('48000.00'))
    expect(plan.incomeItems[0]!.receivedAt).not.toBeNull()
  })

  it('does not count a confirmed item twice', async () => {
    const id = await expectIncome('salary', '46000', { date: '2026-10-01' })
    await expectIncome('freelance', '4000', { date: '2026-10-15' })
    await spend('salary', '46000', { type: 'income', date: '2026-10-01' })
    await actor.request({
      method: 'PATCH',
      url: `/api/v1/plans/${START}/income-items/${id}`,
      payload: { received: tl('46000.00') },
    })

    expect((await readPlan()).summary.income).toEqual(tl('50000.00'))
  })

  it('counts income nobody planned for', async () => {
    await spend('otherIncome', '1500', { type: 'income' })
    const plan = await readPlan()
    expect(plan.summary.income).toEqual(tl('1500.00'))
    expect(plan.summary.unplannedIncome).toEqual(tl('1500.00'))
  })

  it('un-confirms an item when received is cleared', async () => {
    const id = await expectIncome('salary', '46000', { date: '2026-10-01' })
    await actor.request({
      method: 'PATCH',
      url: `/api/v1/plans/${START}/income-items/${id}`,
      payload: { received: tl('44000.00') },
    })
    expect((await readPlan()).summary.income).toEqual(tl('44000.00'))

    await actor.request({
      method: 'PATCH',
      url: `/api/v1/plans/${START}/income-items/${id}`,
      payload: { received: null },
    })
    const plan = await readPlan()
    expect(plan.summary.income).toEqual(tl('46000.00'))
    expect(plan.incomeItems[0]!.receivedAt).toBeNull()
  })

  it('removes an item', async () => {
    const id = await expectIncome('salary', '46000')
    const response = await actor.request({
      method: 'DELETE',
      url: `/api/v1/plans/${START}/income-items/${id}`,
    })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<PlanResponse>().incomeItems).toEqual([])
  })

  it('is idempotent on a client-supplied id', async () => {
    const id = '019a2c1e-0000-7000-8000-00000000f001'
    const payload = {
      id,
      categoryId: category.salary,
      expected: tl('46000.00'),
    }
    const first = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/income-items`,
      payload,
    })
    const second = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/income-items`,
      payload,
    })

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(200)
    expect((await readPlan()).incomeItems).toHaveLength(1)
  })

  it('refuses an expected date outside the month', async () => {
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/income-items`,
      payload: {
        categoryId: category.salary,
        expected: tl('46000.00'),
        expectedDate: '2026-11-02',
      },
    })
    expect(response.statusCode).toBe(400)
  })

  it('refuses an item on a spending category', async () => {
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/income-items`,
      payload: { categoryId: category.groceries, expected: tl('100.00') },
    })
    expect(response.statusCode).toBe(400)
  })
})

/* -------------------------------------------------------------- copying */

describe('copying a month', () => {
  async function planSeptember() {
    await expectIncome('salary', '46000', { start: SEPTEMBER, date: '2026-09-01' })
    await allocate('rent', '9500', { start: SEPTEMBER })
    await allocate('groceries', '5500', { start: SEPTEMBER, rollover: true })
    await allocatePool('9000', SEPTEMBER)
  }

  async function copy(body: Record<string, unknown> = {}): Promise<CopyPlanResponse> {
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/copy-from/${SEPTEMBER}`,
      payload: body,
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json<CopyPlanResponse>()
  }

  it('copies the allocations, the rollover flags and the income items', async () => {
    await planSeptember()
    const result = await copy()

    expect(result.copiedLines).toBe(3)
    expect(result.copiedIncomeItems).toBe(1)
    expect(result.plan.summary.allocated).toEqual(tl('24000.00'))
    expect(rowFor(result.plan, 'groceries').rollover).toBe(true)
    expect(poolRow(result.plan).planned).toEqual(tl('9000.00'))
  })

  it('moves an expected date by the same offset into the new month', async () => {
    await expectIncome('salary', '46000', { start: SEPTEMBER, date: '2026-09-15' })
    await allocate('rent', '9500', { start: SEPTEMBER })

    const result = await copy()
    expect(result.plan.incomeItems[0]!.expectedDate).toBe('2026-10-15')
  })

  it('copies the expectation rather than what arrived', async () => {
    const id = await expectIncome('salary', '46000', { start: SEPTEMBER })
    await actor.request({
      method: 'PATCH',
      url: `/api/v1/plans/${SEPTEMBER}/income-items/${id}`,
      payload: { received: tl('44000.00') },
    })

    const result = await copy()
    expect(result.plan.incomeItems[0]!.expected).toEqual(tl('46000.00'))
    expect(result.plan.incomeItems[0]!.received).toBeNull()
  })

  it('never overwrites an amount already typed into the new month', async () => {
    await planSeptember()
    await allocate('groceries', '6000')

    const result = await copy()
    expect(result.copiedLines).toBe(2)
    expect(result.skippedLines).toBe(1)
    expect(rowFor(result.plan, 'groceries').planned).toEqual(tl('6000.00'))
  })

  it('is safe to run twice', async () => {
    await planSeptember()
    await copy()
    const again = await copy()

    expect(again.copiedLines).toBe(0)
    expect(again.copiedIncomeItems).toBe(0)
    expect(again.plan.summary.allocated).toEqual(tl('24000.00'))
    expect(again.plan.incomeItems).toHaveLength(1)
  })

  it('leaves income alone when asked to', async () => {
    await planSeptember()
    const result = await copy({ includeIncome: false })

    expect(result.copiedIncomeItems).toBe(0)
    expect(result.plan.incomeItems).toEqual([])
  })

  it('offers the latest planned month as the one to copy from', async () => {
    await planSeptember()
    expect((await readPlan()).copyableFrom).toBe(SEPTEMBER)
  })

  it('offers nothing to copy when no earlier month was planned', async () => {
    expect((await readPlan()).copyableFrom).toBeNull()
  })

  it('refuses a month that was never planned', async () => {
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/copy-from/2026-08-01`,
      payload: {},
    })
    expect(response.statusCode).toBe(404)
  })

  it('refuses to copy a month onto itself', async () => {
    await allocate('rent', '9500')
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/copy-from/${START}`,
      payload: {},
    })
    expect(response.statusCode).toBe(400)
  })
})

/* ------------------------------------------------------------- a closed month */

describe('a closed month', () => {
  it('refuses every edit until it is reopened', async () => {
    await allocate('rent', '9500')
    const id = await expectIncome('salary', '46000')
    await database.db
      .update(planPeriods)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(planPeriods.workspaceId, actor.workspaceId))

    const line = await actor.request({
      method: 'PUT',
      url: `/api/v1/plans/${START}/lines`,
      payload: { target: 'category', categoryId: category.rent, planned: tl('10000') },
    })
    const item = await actor.request({
      method: 'DELETE',
      url: `/api/v1/plans/${START}/income-items/${id}`,
    })

    expect(line.statusCode).toBe(409)
    expect(item.statusCode).toBe(409)
    // Reading it still works: a closed month is history, not a secret.
    const plan = await readPlan()
    expect(plan.period.status).toBe('closed')
    expect(plan.period.closedAt).not.toBeNull()
  })
})
