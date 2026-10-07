import type { MeResponse } from '@mizan/contracts'
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
import { workspaceIsolationCases } from './workspace/isolation.ts'

/**
 * One suite over every workspace-scoped endpoint in the API. A phase that adds an endpoint adds
 * its cases to its module's `isolation.ts` and, if the endpoint addresses a resource by id, its
 * fixture to `createFixtures` below. Nothing else changes here.
 */
const CASES: readonly IsolationCase[] = [...workspaceIsolationCases, ...accountIsolationCases]

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

  return { accountId: account.json<{ id: string }>().id }
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
