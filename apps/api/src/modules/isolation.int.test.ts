import type { CategoryListResponse, MeResponse, PlanResponse } from '@mizan/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../db/client.ts'
import { buildTestApp, type TestApp } from '../testing/app.ts'
import {
  expectDeniedAcrossTenants,
  expectRequiresSession,
  type IsolationCase,
  type IsolationIds,
} from '../testing/isolation.ts'
import { connectTestDatabase } from '../testing/postgres.ts'
import { signUpActor, type Actor } from '../testing/session.ts'
import { accountIsolationCases } from './accounts/isolation.ts'
import { categoryIsolationCases } from './categories/isolation.ts'
import { PLAN_ISOLATION_START, planIsolationCases } from './plan/isolation.ts'
import { transactionIsolationCases } from './transactions/isolation.ts'
import { workspaceIsolationCases } from './workspace/isolation.ts'

/**
 * One suite over every workspace-scoped endpoint in the API. A phase that adds an endpoint adds
 * its cases to its module's `isolation.ts` and, if the endpoint addresses a resource by id, its
 * fixture to `createFixtures` below. Nothing else changes here.
 */
const CASES: readonly IsolationCase[] = [
  ...workspaceIsolationCases,
  ...accountIsolationCases,
  ...categoryIsolationCases,
  ...transactionIsolationCases,
  ...planIsolationCases,
]

/** Resources owned by the victim's workspace, keyed by the name the cases use. */
async function createFixtures(victim: Actor): Promise<IsolationIds> {
  const account = await victim.request({
    method: 'POST',
    url: '/api/v1/accounts',
    payload: {
      name: 'Garanti BBVA',
      type: 'checking',
      openingBalance: { amount: '24850.00', currency: 'TRY' },
    },
  })
  if (account.statusCode !== 201) {
    throw new Error(`fixture account failed (${account.statusCode}): ${account.body}`)
  }

  const accountId = account.json<{ id: string }>().id

  const categories = await victim.request({ method: 'GET', url: '/api/v1/categories' })
  const groups = categories.json<CategoryListResponse>().groups
  const flexible = groups.find((group) => group.kind === 'flexible')
  const [category, otherCategory] = flexible?.categories ?? []
  const incomeCategory = groups.find((group) => group.kind === 'income')?.categories[0]
  if (!flexible || !category || !otherCategory || !incomeCategory) {
    throw new Error('fixture categories missing: the workspace was not seeded')
  }

  const transaction = await victim.request({
    method: 'POST',
    url: '/api/v1/transactions',
    payload: {
      type: 'expense',
      date: '2026-10-22',
      accountId,
      payee: 'Migros Kadıköy',
      parts: [{ categoryId: category.id, amount: { amount: '85.00', currency: 'TRY' } }],
    },
  })
  if (transaction.statusCode !== 201) {
    throw new Error(`fixture transaction failed (${transaction.statusCode}): ${transaction.body}`)
  }

  // A planned month with one income item, so the plan endpoints have something to address.
  const incomeItem = await victim.request({
    method: 'POST',
    url: `/api/v1/plans/${PLAN_ISOLATION_START}/income-items`,
    payload: {
      categoryId: incomeCategory.id,
      expected: { amount: '46000.00', currency: 'TRY' },
    },
  })
  if (incomeItem.statusCode !== 201) {
    throw new Error(`fixture income item failed (${incomeItem.statusCode}): ${incomeItem.body}`)
  }

  /*
   * A recorded cover, so the move endpoints have something to address: the fixture transaction
   * spent ₺85 on `category`, so a ₺50 line on it is ₺35 over, and `otherCategory` has the room.
   */
  const allocate = (categoryId: string, planned: string) =>
    victim.request({
      method: 'PUT',
      url: `/api/v1/plans/${PLAN_ISOLATION_START}/lines`,
      payload: { target: 'category', categoryId, planned: { amount: planned, currency: 'TRY' } },
    })
  await allocate(category.id, '50.00')
  await allocate(otherCategory.id, '500.00')

  const cover = await victim.request({
    method: 'POST',
    url: `/api/v1/plans/${PLAN_ISOLATION_START}/moves`,
    payload: {
      from: { target: 'category', categoryId: otherCategory.id },
      to: { target: 'category', categoryId: category.id },
      amount: { amount: '35.00', currency: 'TRY' },
    },
  })
  if (cover.statusCode !== 200) {
    throw new Error(`fixture cover failed (${cover.statusCode}): ${cover.body}`)
  }

  return {
    accountId,
    categoryGroupId: flexible.id,
    categoryId: category.id,
    otherCategoryId: otherCategory.id,
    incomeCategoryId: incomeCategory.id,
    transactionId: transaction.json<{ id: string }>().id,
    planIncomeItemId: incomeItem.json<PlanResponse>().incomeItems[0]!.id,
    planMoveId: cover.json<PlanResponse>().moves[0]!.id,
  }
}

let database: Database
let harness: TestApp
let victim: Actor
let attacker: Actor
let ids: IsolationIds

beforeAll(async () => {
  database = connectTestDatabase()
  harness = await buildTestApp(database)
  victim = await signUpActor(harness.app, { name: 'Victim' })
  attacker = await signUpActor(harness.app, { name: 'Attacker' })
  ids = await createFixtures(victim)
})

afterAll(async () => {
  await harness?.close()
  await database?.close()
})

describe('every protected endpoint requires a session', () => {
  it.for([...CASES])('$name', async (testCase) => {
    await expectRequiresSession(harness.app, testCase, ids)
  })
})

describe('no endpoint reaches another workspace', () => {
  // One test over every id-addressed case: the list is empty until phase 4 adds accounts, and an
  // empty `it.for` is a suite error rather than a pass.
  it('refuses every id-addressed endpoint from another workspace', async () => {
    for (const testCase of CASES) {
      if (testCase.crossTenant === false) continue
      await expectDeniedAcrossTenants(attacker, testCase, ids)
    }
  })
})

describe('two workspaces stay separate', () => {
  it('gives each user their own workspace', async () => {
    const theirs = (await victim.request({ method: 'GET', url: '/api/v1/me' })).json<MeResponse>()
      .workspace
    const mine = (await attacker.request({ method: 'GET', url: '/api/v1/me' })).json<MeResponse>()
      .workspace

    expect(mine.id).not.toBe(theirs.id)
    expect(victim.userId).not.toBe(attacker.userId)
  })

  it('keeps a settings change inside the workspace that made it', async () => {
    await attacker.request({
      method: 'PATCH',
      url: '/api/v1/workspace/settings',
      payload: { periodStartDay: 25, name: 'Attacker household' },
    })

    const theirs = (
      await victim.request({ method: 'GET', url: '/api/v1/workspace/settings' })
    ).json<MeResponse>().workspace
    expect(theirs.periodStartDay).toBe(1)
    expect(theirs.name).toBe('Personal')
  })

  it('keeps a profile change inside the account that made it', async () => {
    await attacker.request({ method: 'PATCH', url: '/api/v1/me', payload: { name: 'Renamed' } })

    const theirs = (await victim.request({ method: 'GET', url: '/api/v1/me' })).json<MeResponse>()
    expect(theirs.user.name).toBe('Victim')
  })
})
