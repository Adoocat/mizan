import { moneyFromDto } from '@mizan/contracts'
import type { CategoryListResponse, PlanResponse, PlanRowDto } from '@mizan/contracts'
import { fixedClock } from '@mizan/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import { accounts, planPeriods, transactions } from '../../db/schema/index.ts'
import { buildTestApp, type TestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import { signUpActor, type Actor } from '../../testing/session.ts'

/**
 * Phase 7's definition of done, over the API: the mockup month gives ₺300 a day, and ₺85 spent
 * today leaves ₺215 (PLAN §20, §10).
 *
 * The clock is pinned to Thursday 22 October 2026, the day the mockups depict — 21 days gone, 10
 * left — because every figure here is a function of what day it is.
 */
const START = '2026-10-01'
const TODAY = '2026-10-22'

let database: Database
let harness: TestApp
let actor: Actor
let category: Record<string, string>
let checking: string

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
  await database.db.delete(accounts).where(eq(accounts.workspaceId, actor.workspaceId))

  const account = await actor.request({
    method: 'POST',
    url: '/api/v1/accounts',
    payload: { name: 'Garanti', type: 'checking', openingBalance: tl('50000.00') },
  })
  checking = account.json<{ id: string }>().id
})

const tl = (amount: string) => ({ amount, currency: 'TRY' as const })

async function readPlan(start = START): Promise<PlanResponse> {
  const response = await actor.request({ method: 'GET', url: `/api/v1/plans/${start}` })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<PlanResponse>()
}

async function allocate(categoryKey: string, amount: string): Promise<void> {
  const response = await actor.request({
    method: 'PUT',
    url: `/api/v1/plans/${START}/lines`,
    payload: { target: 'category', categoryId: category[categoryKey], planned: tl(amount) },
  })
  expect(response.statusCode, response.body).toBe(200)
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
  categoryKey: string,
  amount: string,
  { date = '2026-10-10', type = 'expense' } = {},
): Promise<void> {
  const response = await actor.request({
    method: 'POST',
    url: '/api/v1/transactions',
    payload: {
      type,
      date,
      accountId: checking,
      parts: [{ categoryId: category[categoryKey], amount: tl(amount) }],
    },
  })
  expect(response.statusCode, response.body).toBe(201)
}

async function expectIncome(categoryKey: string, amount: string, start = START): Promise<void> {
  const response = await actor.request({
    method: 'POST',
    url: `/api/v1/plans/${start}/income-items`,
    payload: { categoryId: category[categoryKey], expected: tl(amount) },
  })
  expect(response.statusCode, response.body).toBe(201)
}

/**
 * A salary to plan against.
 *
 * Without one the month is over-allocated the moment anything is allocated, and nothing can be
 * spent — which is right (§10: available to spend never shows money the user does not have) but
 * is not what most of these tests are about.
 */
const fund = (start = START) => expectIncome('salary', '50000', start)

async function cover(fromKey: string, toKey: string, amount: string): Promise<PlanResponse> {
  const response = await actor.request({
    method: 'POST',
    url: `/api/v1/plans/${START}/moves`,
    payload: {
      from:
        fromKey === 'pool'
          ? { target: 'pool' }
          : { target: 'category', categoryId: category[fromKey] },
      to: { target: 'category', categoryId: category[toKey] },
      amount: tl(amount),
    },
  })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<PlanResponse>()
}

const rowFor = (plan: PlanResponse, categoryKey: string): PlanRowDto => {
  const found = plan.groups
    .flatMap((one) => one.rows)
    .find((row) => row.categoryId === category[categoryKey])
  if (!found) throw new Error(`no row for ${categoryKey}`)
  return found
}

/* --------------------------------------------------- the definition of done */

describe('safe to spend today', () => {
  /** The mockup month: a ₺9,000 pool with ₺6,000 spent before today. */
  async function mockupMonth() {
    await expectIncome('salary', '50000')
    await allocatePool('9000')
    await allocate('rent', '27000')
    await allocate('savingsTransfer', '6000')
    await allocate('investmentContribution', '8000')
    // Pooled spending, all of it before today.
    await spend('diningOut', '2850')
    await spend('shopping', '1900')
    await spend('entertainment', '750')
    await spend('other', '500')
  }

  it('divides ₺3,000 over ten days into ₺300 a day', async () => {
    await mockupMonth()
    const { spend: figures } = await readPlan()

    expect(figures.poolBudget).toEqual(tl('9000.00'))
    expect(figures.poolSpent).toEqual(tl('6000.00'))
    expect(figures.availableToSpend).toEqual(tl('3000.00'))
    expect(figures.daysLeft).toBe(10)
    expect(figures.safeToday).toEqual(tl('300.00'))
    expect(figures.spentToday).toEqual(tl('0.00'))
    expect(figures.remainingToday).toEqual(tl('300.00'))
  })

  it('leaves ₺215 for today after ₺85 is spent today', async () => {
    await mockupMonth()
    await spend('diningOut', '85', { date: TODAY })

    const { spend: figures } = await readPlan()
    // The allowance is set at the start of the day and spent down, so it still reads ₺300.
    expect(figures.safeToday).toEqual(tl('300.00'))
    expect(figures.spentToday).toEqual(tl('85.00'))
    expect(figures.remainingToday).toEqual(tl('215.00'))
    // And what is left of the month has fallen by the ₺85.
    expect(figures.availableToSpend).toEqual(tl('2915.00'))
    expect(figures.availableAtStartOfToday).toEqual(tl('3000.00'))
  })

  it('rolls an unspent allowance into tomorrow', async () => {
    await mockupMonth()
    const tomorrow = await buildTestApp(database, {
      clock: fixedClock('2026-10-23T09:00:00+03:00'),
    })
    try {
      const response = await actor.request({ method: 'GET', url: `/api/v1/plans/${START}` })
      expect(response.statusCode).toBe(200)
      // The same ₺3,000 over nine days once today's spending is behind it.
      const next = await tomorrow.app.inject({
        method: 'GET',
        url: `/api/v1/plans/${START}`,
        headers: { origin: 'http://localhost:5173', cookie: actor.cookie },
      })
      expect(next.json<PlanResponse>().spend.safeToday).toEqual(tl('333.33'))
    } finally {
      await tomorrow.close()
    }
  })

  it('rounds the daily figure down, so the days can never overspend the month', async () => {
    await fund()
    await allocatePool('1000')
    const { spend: figures } = await readPlan()
    // ₺1,000 over ten days is exact; ₺999 is not.
    expect(figures.safeToday).toEqual(tl('100.00'))

    await allocatePool('999')
    expect((await readPlan()).spend.safeToday).toEqual(tl('99.90'))
  })

  it('is zero in a month that is over', async () => {
    await fund('2026-09-01')
    const september = await actor.request({
      method: 'PUT',
      url: '/api/v1/plans/2026-09-01/lines',
      payload: { target: 'pool', planned: tl('9000.00') },
    })
    expect(september.statusCode).toBe(200)

    const plan = await readPlan('2026-09-01')
    expect(plan.spend.daysLeft).toBe(0)
    expect(plan.spend.safeToday).toEqual(tl('0.00'))
    expect(plan.spend.availableToSpend).toEqual(tl('9000.00'))
  })

  it('spreads the whole pool over a month that has not started', async () => {
    await fund('2026-11-01')
    const november = await actor.request({
      method: 'PUT',
      url: '/api/v1/plans/2026-11-01/lines',
      payload: { target: 'pool', planned: tl('3000.00') },
    })
    expect(november.statusCode).toBe(200)

    const plan = await readPlan('2026-11-01')
    expect(plan.spend.daysLeft).toBe(30)
    expect(plan.spend.safeToday).toEqual(tl('100.00'))
  })

  it('gives the whole remainder on the last day', async () => {
    const lastDay = await buildTestApp(database, {
      clock: fixedClock('2026-10-31T09:00:00+03:00'),
    })
    try {
      await fund()
      await allocatePool('412.37')
      const response = await lastDay.app.inject({
        method: 'GET',
        url: `/api/v1/plans/${START}`,
        headers: { origin: 'http://localhost:5173', cookie: actor.cookie },
      })
      const figures = response.json<PlanResponse>().spend
      expect(figures.daysLeft).toBe(1)
      expect(figures.safeToday).toEqual(tl('412.37'))
    } finally {
      await lastDay.close()
    }
  })
})

/* ------------------------------------------------- what reduces the figure */

describe('what reduces available to spend', () => {
  it('drops by an uncovered overspend the moment it happens (decision D4)', async () => {
    await fund()
    await allocatePool('9000')
    await allocate('personalCare', '500')
    await spend('personalCare', '610')

    const plan = await readPlan()
    expect(plan.spend.uncoveredOverspend).toEqual(tl('110.00'))
    expect(plan.spend.availableToSpend).toEqual(tl('8890.00'))
    expect(plan.spend.poolAvailable).toEqual(tl('9000.00'))
  })

  it('drops by an over-allocation', async () => {
    await expectIncome('salary', '10000')
    await allocatePool('9000')
    await allocate('rent', '3000')

    const plan = await readPlan()
    expect(plan.summary.unassigned).toEqual(tl('-2000.00'))
    expect(plan.spend.overAllocated).toEqual(tl('2000.00'))
    expect(plan.spend.availableToSpend).toEqual(tl('7000.00'))
  })

  it('ignores money that is still waiting to be assigned', async () => {
    await expectIncome('salary', '50000')
    await allocatePool('9000')

    const plan = await readPlan()
    expect(plan.summary.unassigned).toEqual(tl('41000.00'))
    expect(plan.spend.availableToSpend).toEqual(tl('9000.00'))
  })

  it('never goes below zero', async () => {
    await fund()
    await allocatePool('100')
    await allocate('personalCare', '100')
    await spend('personalCare', '900')

    const plan = await readPlan()
    expect(plan.spend.uncoveredOverspend).toEqual(tl('800.00'))
    expect(plan.spend.availableToSpend).toEqual(tl('0.00'))
    expect(plan.spend.safeToday).toEqual(tl('0.00'))
  })

  it('counts an unplanned essential as an overspend', async () => {
    await fund()
    await allocatePool('9000')
    // Insurance has no line at all, so nothing was ever set aside for it (§10).
    await spend('insurance', '3000')

    const plan = await readPlan()
    expect(plan.spend.uncoveredOverspend).toEqual(tl('3000.00'))
    expect(plan.spend.availableToSpend).toEqual(tl('6000.00'))
  })

  it('counts an overspend made today against today, not against the allowance', async () => {
    await fund()
    await allocatePool('9000')
    await allocate('personalCare', '500')
    await spend('personalCare', '610', { date: TODAY })

    const plan = await readPlan()
    // ₺9,000 over ten days when the day began.
    expect(plan.spend.safeToday).toEqual(tl('900.00'))
    expect(plan.spend.spentToday).toEqual(tl('110.00'))
    expect(plan.spend.remainingToday).toEqual(tl('790.00'))
  })

  it('shows nothing spent on a day that only brought money in', async () => {
    await fund()
    await allocatePool('9000')
    await spend('diningOut', '500')
    await spend('diningOut', '200', { date: TODAY, type: 'income' })

    const plan = await readPlan()
    expect(plan.spend.spentToday).toEqual(tl('0.00'))
    expect(moneyFromDto(plan.spend.remainingToday).isPositive()).toBe(true)
  })
})

/* ------------------------------------------------------------- covering */

describe('covering an overspend', () => {
  async function overspentMonth() {
    await fund()
    await allocatePool('9000')
    await allocate('personalCare', '500')
    await allocate('groceries', '6000')
    await spend('personalCare', '610')
    await spend('groceries', '4850')
  }

  it('records where the money came from and clears the overspend', async () => {
    await overspentMonth()
    const plan = await cover('groceries', 'personalCare', '110')

    expect(plan.moves).toHaveLength(1)
    expect(plan.moves[0]!.amount).toEqual(tl('110.00'))
    expect(rowFor(plan, 'personalCare').movesIn).toEqual(tl('110.00'))
    expect(rowFor(plan, 'personalCare').available).toEqual(tl('0.00'))
    expect(rowFor(plan, 'personalCare').overspend).toEqual(tl('0.00'))
    // Groceries paid for it: ₺6,000 − ₺110 − ₺4,850.
    expect(rowFor(plan, 'groceries').movesOut).toEqual(tl('110.00'))
    expect(rowFor(plan, 'groceries').available).toEqual(tl('1040.00'))
  })

  it('leaves the plan whole: allocated does not move', async () => {
    await overspentMonth()
    const before = (await readPlan()).summary.allocated
    const plan = await cover('groceries', 'personalCare', '110')

    expect(plan.summary.allocated).toEqual(before)
    expect(plan.summary.overspend).toEqual(tl('0.00'))
  })

  it('puts the money back into what can be spent when it comes from a line', async () => {
    await overspentMonth()
    expect((await readPlan()).spend.availableToSpend).toEqual(tl('8890.00'))

    const plan = await cover('groceries', 'personalCare', '110')
    // The ₺110 was allocated to groceries, so the pool keeps its ₺9,000.
    expect(plan.spend.uncoveredOverspend).toEqual(tl('0.00'))
    expect(plan.spend.availableToSpend).toEqual(tl('9000.00'))
  })

  it('changes nothing overall when it comes from the pool', async () => {
    await overspentMonth()
    const plan = await cover('pool', 'personalCare', '110')

    // The overspend is gone and the pool is ₺110 smaller: the same ₺8,890 either way.
    expect(plan.spend.uncoveredOverspend).toEqual(tl('0.00'))
    expect(plan.spend.poolAvailable).toEqual(tl('8890.00'))
    expect(plan.spend.availableToSpend).toEqual(tl('8890.00'))
  })

  it('opens a line for an unplanned category so it can be covered', async () => {
    await fund()
    await allocatePool('9000')
    await allocate('groceries', '6000')
    await spend('insurance', '3000')

    const plan = await cover('groceries', 'insurance', '3000')
    expect(rowFor(plan, 'insurance').lineId).not.toBeNull()
    expect(rowFor(plan, 'insurance').planned).toEqual(tl('0.00'))
    expect(rowFor(plan, 'insurance').movesIn).toEqual(tl('3000.00'))
    expect(plan.spend.uncoveredOverspend).toEqual(tl('0.00'))
  })

  it('can be undone', async () => {
    await overspentMonth()
    const covered = await cover('groceries', 'personalCare', '110')

    const response = await actor.request({
      method: 'DELETE',
      url: `/api/v1/plans/${START}/moves/${covered.moves[0]!.id}`,
    })
    expect(response.statusCode, response.body).toBe(200)

    const plan = response.json<PlanResponse>()
    expect(plan.moves).toEqual([])
    expect(rowFor(plan, 'personalCare').overspend).toEqual(tl('110.00'))
    expect(plan.spend.availableToSpend).toEqual(tl('8890.00'))
  })

  it('refuses to clear an amount while a cover points at the line', async () => {
    await overspentMonth()
    await cover('groceries', 'personalCare', '110')

    const response = await actor.request({
      method: 'PUT',
      url: `/api/v1/plans/${START}/lines`,
      payload: { target: 'category', categoryId: category.groceries, planned: tl('0') },
    })
    expect(response.statusCode).toBe(409)
  })

  it.each([
    ['the line is not overspent', 'groceries', 'transport', '100', 409],
    ['the amount is more than the overspend', 'groceries', 'personalCare', '200', 409],
    ['the source has nothing spare', 'personalCare', 'personalCare', '110', 400],
  ])('refuses when %s', async (_label, from, to, amount, status) => {
    await overspentMonth()
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/moves`,
      payload: {
        from: { target: 'category', categoryId: category[from] },
        to: { target: 'category', categoryId: category[to] },
        amount: tl(amount),
      },
    })
    expect(response.statusCode, response.body).toBe(status)
  })

  it('refuses a source that cannot afford it', async () => {
    await fund()
    await allocatePool('9000')
    await allocate('personalCare', '500')
    await allocate('transport', '300')
    await spend('personalCare', '610')
    await spend('transport', '300')

    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/moves`,
      payload: {
        from: { target: 'category', categoryId: category.transport },
        to: { target: 'category', categoryId: category.personalCare },
        amount: tl('110'),
      },
    })
    expect(response.statusCode).toBe(409)
    // Nothing was written, so the overspend is still there to deal with.
    expect((await readPlan()).spend.uncoveredOverspend).toEqual(tl('110.00'))
  })

  it('refuses to cover a closed month', async () => {
    await overspentMonth()
    await database.db
      .update(planPeriods)
      .set({ status: 'closed', closedAt: new Date() })
      .where(eq(planPeriods.workspaceId, actor.workspaceId))

    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/plans/${START}/moves`,
      payload: {
        from: { target: 'category', categoryId: category.groceries },
        to: { target: 'category', categoryId: category.personalCare },
        amount: tl('110'),
      },
    })
    expect(response.statusCode).toBe(409)
  })
})
