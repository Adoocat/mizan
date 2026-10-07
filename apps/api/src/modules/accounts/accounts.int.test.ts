import type {
  AccountDetailResponse,
  AccountDto,
  AccountListResponse,
  ReconcileAccountResponse,
} from '@mizan/contracts'
import { fixedClock } from '@mizan/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import { buildApp, type App } from '../../app.ts'
import { createAuth } from '../../auth/auth.ts'
import { accounts, transactionLines, transactions } from '../../db/schema/index.ts'
import { createRecordingMailer, TEST_AUTH_SECRET, TEST_WEB_ORIGIN } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import { signUpActor, type Actor } from '../../testing/session.ts'

/** Pinned so "today" in a created transaction is predictable. 22 Oct 2026, the mockups' day. */
const NOW = '2026-10-22T11:58:00+03:00'
const TODAY = '2026-10-22'

let database: Database
let app: App
let actor: Actor

beforeAll(async () => {
  database = connectTestDatabase()
  const config = {
    nodeEnv: 'test',
    logLevel: 'silent',
    webOrigin: TEST_WEB_ORIGIN,
    trustProxy: false,
    authSecret: TEST_AUTH_SECRET,
    breachedPasswordCheck: false,
  } as const
  app = await buildApp({
    config,
    database,
    auth: createAuth({ config, database, mailer: createRecordingMailer(), ipRateLimit: false }),
    clock: fixedClock(NOW),
  })
  actor = await signUpActor(app)
})

afterAll(async () => {
  await app?.close()
  await database?.close()
})

/** A clean slate per test: these tests count rows and totals across the whole workspace. */
beforeEach(async () => {
  await database.db.delete(transactions).where(eq(transactions.workspaceId, actor.workspaceId))
  await database.db.delete(accounts).where(eq(accounts.workspaceId, actor.workspaceId))
})

const create = (payload: object) =>
  actor.request({ method: 'POST', url: '/api/v1/accounts', payload })

const list = async (query = '') => {
  const response = await actor.request({ method: 'GET', url: `/api/v1/accounts${query}` })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<AccountListResponse>()
}

const createOk = async (payload: object): Promise<AccountDto> => {
  const response = await create(payload)
  expect(response.statusCode, response.body).toBe(201)
  return response.json<AccountDto>()
}

describe('creating an account', () => {
  it('shows an opening balance of exactly 24,850 TL', async () => {
    // PLAN §20, phase 4 Definition of Done.
    const account = await createOk({
      name: 'Garanti BBVA',
      type: 'checking',
      institution: '··4471',
      openingBalance: { amount: '24850.00', currency: 'TRY' },
    })

    expect(account).toMatchObject({
      name: 'Garanti BBVA',
      type: 'checking',
      currency: 'TRY',
      institution: '··4471',
      onBudget: true,
      includeInNetWorth: true,
      archivedAt: null,
      balance: { amount: '24850.00', currency: 'TRY' },
    })

    const { accounts: listed } = await list()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.balance).toEqual({ amount: '24850.00', currency: 'TRY' })
  })

  it('records the opening balance as a dated transaction, not a stored column', async () => {
    const account = await createOk({
      name: 'Cash',
      type: 'cash',
      openingBalance: { amount: '1250.00', currency: 'TRY' },
    })

    const rows = await database.db
      .select({
        type: transactions.type,
        date: transactions.date,
        source: transactions.source,
        amount: transactionLines.amount,
        baseAmount: transactionLines.baseAmount,
        fxRate: transactionLines.fxRate,
        currency: transactionLines.currency,
        accountId: transactionLines.accountId,
      })
      .from(transactions)
      .innerJoin(transactionLines, eq(transactionLines.transactionId, transactions.id))
      .where(eq(transactions.workspaceId, actor.workspaceId))

    expect(rows).toEqual([
      {
        type: 'opening_balance',
        date: TODAY,
        source: 'manual',
        amount: '1250.0000',
        // Base amounts are frozen on the line and equal the amount while everything is in TRY.
        baseAmount: '1250.0000',
        fxRate: null,
        currency: 'TRY',
        accountId: account.id,
      },
    ])
  })

  it('accepts an explicit opening balance date', async () => {
    await createOk({
      name: 'Backdated',
      type: 'savings',
      openingBalance: { amount: '500.00', currency: 'TRY' },
      openingBalanceDate: '2026-09-01',
    })

    const [row] = await database.db
      .select({ date: transactions.date })
      .from(transactions)
      .where(eq(transactions.workspaceId, actor.workspaceId))
    expect(row?.date).toBe('2026-09-01')
  })

  it('writes no transaction at all when the account starts empty', async () => {
    const account = await createOk({ name: 'Empty', type: 'cash' })
    expect(account.balance).toEqual({ amount: '0.00', currency: 'TRY' })

    const rows = await database.db
      .select()
      .from(transactions)
      .where(eq(transactions.workspaceId, actor.workspaceId))
    expect(rows).toHaveLength(0)
  })

  it('treats a zero opening balance the same way', async () => {
    await createOk({
      name: 'Zero',
      type: 'cash',
      openingBalance: { amount: '0.00', currency: 'TRY' },
    })
    const rows = await database.db
      .select()
      .from(transactions)
      .where(eq(transactions.workspaceId, actor.workspaceId))
    expect(rows).toHaveLength(0)
  })

  it('accepts a negative opening balance on a credit card', async () => {
    const account = await createOk({
      name: 'Bonus card',
      type: 'credit_card',
      openingBalance: { amount: '-4860.00', currency: 'TRY' },
    })
    expect(account.balance).toEqual({ amount: '-4860.00', currency: 'TRY' })
  })

  it('is idempotent for a repeated client id', async () => {
    const id = '019a2c1e-0000-7000-8000-00000000a001'
    const first = await create({
      id,
      name: 'Double tap',
      type: 'checking',
      openingBalance: { amount: '100.00', currency: 'TRY' },
    })
    expect(first.statusCode).toBe(201)

    const second = await create({
      id,
      name: 'Double tap',
      type: 'checking',
      openingBalance: { amount: '100.00', currency: 'TRY' },
    })
    // A repeat is not a new account: 200, the same row, and the balance is not doubled.
    expect(second.statusCode).toBe(200)
    expect(second.json<AccountDto>().balance).toEqual({ amount: '100.00', currency: 'TRY' })

    const { accounts: listed } = await list()
    expect(listed).toHaveLength(1)
  })

  it('refuses an unknown type, a blank name and a foreign currency', async () => {
    expect((await create({ name: 'Nope', type: 'investment' })).statusCode).toBe(400)
    expect((await create({ name: '   ', type: 'cash' })).statusCode).toBe(400)
    expect(
      (
        await create({
          name: 'Dollars',
          type: 'checking',
          openingBalance: { amount: '100.00', currency: 'USD' },
        })
      ).statusCode,
    ).toBe(400)
  })

  it('refuses more decimals than the currency has', async () => {
    const response = await create({
      name: 'Too precise',
      type: 'cash',
      openingBalance: { amount: '100.123', currency: 'TRY' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('puts new accounts at the end of the list', async () => {
    await createOk({ name: 'First', type: 'checking' })
    await createOk({ name: 'Second', type: 'cash' })
    const { accounts: listed } = await list()
    expect(listed.map((account) => account.name)).toEqual(['First', 'Second'])
  })
})

describe('balances', () => {
  it('derives the list total as assets minus liabilities', async () => {
    await createOk({
      name: 'Garanti BBVA',
      type: 'checking',
      openingBalance: { amount: '24850.00', currency: 'TRY' },
    })
    await createOk({
      name: 'House deposit',
      type: 'savings',
      openingBalance: { amount: '650000.00', currency: 'TRY' },
    })
    await createOk({
      name: 'Cash',
      type: 'cash',
      openingBalance: { amount: '1250.00', currency: 'TRY' },
    })
    await createOk({
      name: 'Bonus card',
      type: 'credit_card',
      openingBalance: { amount: '-4860.00', currency: 'TRY' },
    })

    const result = await list()
    expect(result.netWorth).toEqual({ amount: '671240.00', currency: 'TRY' })
    expect(result.onBudgetTotal).toEqual({ amount: '671240.00', currency: 'TRY' })
  })

  it('leaves an excluded account out of net worth but not out of the list', async () => {
    const kept = await createOk({
      name: 'Counted',
      type: 'checking',
      openingBalance: { amount: '1000.00', currency: 'TRY' },
    })
    const excluded = await createOk({
      name: 'Not counted',
      type: 'savings',
      openingBalance: { amount: '500.00', currency: 'TRY' },
    })
    await actor.request({
      method: 'PATCH',
      url: `/api/v1/accounts/${excluded.id}`,
      payload: { includeInNetWorth: false },
    })

    const result = await list()
    expect(result.accounts).toHaveLength(2)
    expect(result.netWorth).toEqual({ amount: '1000.00', currency: 'TRY' })
    expect(result.accounts.find((a) => a.id === kept.id)?.balance).toEqual({
      amount: '1000.00',
      currency: 'TRY',
    })
  })

  it('excludes an off-budget account from the on-budget total only', async () => {
    const offBudget = await createOk({
      name: 'Off budget',
      type: 'savings',
      openingBalance: { amount: '700.00', currency: 'TRY' },
    })
    await createOk({
      name: 'On budget',
      type: 'checking',
      openingBalance: { amount: '300.00', currency: 'TRY' },
    })
    await actor.request({
      method: 'PATCH',
      url: `/api/v1/accounts/${offBudget.id}`,
      payload: { onBudget: false },
    })

    const result = await list()
    expect(result.onBudgetTotal).toEqual({ amount: '300.00', currency: 'TRY' })
    expect(result.netWorth).toEqual({ amount: '1000.00', currency: 'TRY' })
  })
})

describe('reading one account', () => {
  it('returns the account with its movements, newest first', async () => {
    const account = await createOk({
      name: 'Garanti BBVA',
      type: 'checking',
      openingBalance: { amount: '24850.00', currency: 'TRY' },
    })
    await actor.request({
      method: 'POST',
      url: `/api/v1/accounts/${account.id}/reconcile`,
      payload: { statementBalance: { amount: '24910.50', currency: 'TRY' }, memo: 'Bank fee' },
    })

    const response = await actor.request({ method: 'GET', url: `/api/v1/accounts/${account.id}` })
    expect(response.statusCode).toBe(200)
    const detail = response.json<AccountDetailResponse>()

    expect(detail.account.balance).toEqual({ amount: '24910.50', currency: 'TRY' })
    expect(detail.entries).toHaveLength(2)
    expect(detail.entries[0]).toMatchObject({
      type: 'adjustment',
      memo: 'Bank fee',
      amount: { amount: '60.50', currency: 'TRY' },
    })
    expect(detail.entries[1]).toMatchObject({
      type: 'opening_balance',
      amount: { amount: '24850.00', currency: 'TRY' },
    })
  })

  it('answers 404 for an id that does not exist', async () => {
    const response = await actor.request({
      method: 'GET',
      url: '/api/v1/accounts/019a2c1e-0000-7000-8000-0000000fffff',
    })
    expect(response.statusCode).toBe(404)
  })

  it('answers 400 for an id that is not a UUID', async () => {
    const response = await actor.request({ method: 'GET', url: '/api/v1/accounts/not-a-uuid' })
    expect(response.statusCode).toBe(400)
  })
})

describe('editing an account', () => {
  it('renames it and clears the institution', async () => {
    const account = await createOk({ name: 'Old name', type: 'checking', institution: '··4471' })

    const renamed = await actor.request({
      method: 'PATCH',
      url: `/api/v1/accounts/${account.id}`,
      payload: { name: 'Garanti BBVA', institution: null },
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json<AccountDto>()).toMatchObject({
      name: 'Garanti BBVA',
      institution: null,
    })
  })

  it('refuses an empty patch and a blank name', async () => {
    const account = await createOk({ name: 'Account', type: 'cash' })
    for (const payload of [{}, { name: '  ' }]) {
      const response = await actor.request({
        method: 'PATCH',
        url: `/api/v1/accounts/${account.id}`,
        payload,
      })
      expect(response.statusCode, JSON.stringify(payload)).toBe(400)
    }
  })

  it('cannot change the type or the currency', async () => {
    const account = await createOk({ name: 'Account', type: 'cash' })
    const response = await actor.request({
      method: 'PATCH',
      url: `/api/v1/accounts/${account.id}`,
      payload: { name: 'Account', type: 'credit_card', currency: 'USD' },
    })
    expect(response.statusCode).toBe(200)

    const reread = await actor.request({ method: 'GET', url: `/api/v1/accounts/${account.id}` })
    expect(reread.json<AccountDetailResponse>().account).toMatchObject({
      type: 'cash',
      currency: 'TRY',
    })
  })
})

describe('archiving', () => {
  it('hides the account from the list but keeps its history', async () => {
    const account = await createOk({
      name: 'Closed card',
      type: 'credit_card',
      openingBalance: { amount: '-100.00', currency: 'TRY' },
    })

    const archived = await actor.request({
      method: 'POST',
      url: `/api/v1/accounts/${account.id}/archive`,
    })
    expect(archived.statusCode).toBe(200)
    expect(archived.json<AccountDto>().archivedAt).not.toBeNull()

    expect((await list()).accounts).toHaveLength(0)
    const withArchived = await list('?includeArchived=true')
    expect(withArchived.accounts).toHaveLength(1)
    // The history survives, so past periods still add up.
    expect(withArchived.accounts[0]?.balance).toEqual({ amount: '-100.00', currency: 'TRY' })
  })

  it('can be undone', async () => {
    const account = await createOk({ name: 'Reopened', type: 'cash' })
    await actor.request({ method: 'POST', url: `/api/v1/accounts/${account.id}/archive` })

    const restored = await actor.request({
      method: 'POST',
      url: `/api/v1/accounts/${account.id}/unarchive`,
    })
    expect(restored.statusCode).toBe(200)
    expect(restored.json<AccountDto>().archivedAt).toBeNull()
    expect((await list()).accounts).toHaveLength(1)
  })

  it('refuses to archive twice, or to unarchive a live account', async () => {
    const account = await createOk({ name: 'Account', type: 'cash' })
    expect(
      (await actor.request({ method: 'POST', url: `/api/v1/accounts/${account.id}/unarchive` }))
        .statusCode,
    ).toBe(409)

    await actor.request({ method: 'POST', url: `/api/v1/accounts/${account.id}/archive` })
    expect(
      (await actor.request({ method: 'POST', url: `/api/v1/accounts/${account.id}/archive` }))
        .statusCode,
    ).toBe(409)
  })
})

describe('reconciling', () => {
  const reconcile = (id: string, payload: object) =>
    actor.request({ method: 'POST', url: `/api/v1/accounts/${id}/reconcile`, payload })

  it('writes the one adjustment that makes the balance match the statement', async () => {
    const account = await createOk({
      name: 'Garanti BBVA',
      type: 'checking',
      openingBalance: { amount: '24850.00', currency: 'TRY' },
    })

    const response = await reconcile(account.id, {
      statementBalance: { amount: '24910.50', currency: 'TRY' },
    })
    expect(response.statusCode, response.body).toBe(200)
    const result = response.json<ReconcileAccountResponse>()
    expect(result.adjustment).toEqual({ amount: '60.50', currency: 'TRY' })
    expect(result.account.balance).toEqual({ amount: '24910.50', currency: 'TRY' })

    const rows = await database.db
      .select({ type: transactions.type, date: transactions.date })
      .from(transactions)
      .where(eq(transactions.workspaceId, actor.workspaceId))
    expect(rows).toHaveLength(2)
    expect(rows.filter((row) => row.type === 'adjustment')).toEqual([
      { type: 'adjustment', date: TODAY },
    ])
  })

  it('writes a negative adjustment when Mizan recorded too much', async () => {
    const account = await createOk({
      name: 'Account',
      type: 'checking',
      openingBalance: { amount: '1000.00', currency: 'TRY' },
    })
    const result = (
      await reconcile(account.id, { statementBalance: { amount: '900.00', currency: 'TRY' } })
    ).json<ReconcileAccountResponse>()
    expect(result.adjustment).toEqual({ amount: '-100.00', currency: 'TRY' })
    expect(result.account.balance).toEqual({ amount: '900.00', currency: 'TRY' })
  })

  it('writes nothing when the two already agree', async () => {
    const account = await createOk({
      name: 'Account',
      type: 'checking',
      openingBalance: { amount: '1000.00', currency: 'TRY' },
    })
    const result = (
      await reconcile(account.id, { statementBalance: { amount: '1000.00', currency: 'TRY' } })
    ).json<ReconcileAccountResponse>()

    expect(result.adjustment).toEqual({ amount: '0.00', currency: 'TRY' })
    const rows = await database.db
      .select()
      .from(transactions)
      .where(eq(transactions.workspaceId, actor.workspaceId))
    expect(rows).toHaveLength(1)
  })

  it('reconciles an account that has no transactions yet', async () => {
    const account = await createOk({ name: 'Fresh', type: 'cash' })
    const result = (
      await reconcile(account.id, { statementBalance: { amount: '75.25', currency: 'TRY' } })
    ).json<ReconcileAccountResponse>()
    expect(result.adjustment).toEqual({ amount: '75.25', currency: 'TRY' })
    expect(result.account.balance).toEqual({ amount: '75.25', currency: 'TRY' })
  })

  it('is idempotent in effect: reconciling twice to the same figure changes nothing', async () => {
    const account = await createOk({
      name: 'Account',
      type: 'checking',
      openingBalance: { amount: '1000.00', currency: 'TRY' },
    })
    await reconcile(account.id, { statementBalance: { amount: '1200.00', currency: 'TRY' } })
    const second = (
      await reconcile(account.id, { statementBalance: { amount: '1200.00', currency: 'TRY' } })
    ).json<ReconcileAccountResponse>()

    expect(second.adjustment).toEqual({ amount: '0.00', currency: 'TRY' })
    expect(second.account.balance).toEqual({ amount: '1200.00', currency: 'TRY' })
  })

  it('refuses a statement in another currency and an archived account', async () => {
    const account = await createOk({ name: 'Account', type: 'cash' })
    expect(
      (await reconcile(account.id, { statementBalance: { amount: '10.00', currency: 'USD' } }))
        .statusCode,
    ).toBe(400)

    await actor.request({ method: 'POST', url: `/api/v1/accounts/${account.id}/archive` })
    expect(
      (await reconcile(account.id, { statementBalance: { amount: '10.00', currency: 'TRY' } }))
        .statusCode,
    ).toBe(409)
  })
})

describe('ledger invariants at the database level', () => {
  it('refuses a line whose currency differs from its account', async () => {
    const account = await createOk({ name: 'Account', type: 'cash' })
    const [row] = await database.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.workspaceId, actor.workspaceId))
      .limit(1)

    // No transaction exists yet for an empty account, so insert the header first.
    const transactionId = row?.id ?? '019a2c1e-0000-7000-8000-00000000b001'
    if (!row) {
      await database.db.insert(transactions).values({
        id: transactionId,
        workspaceId: actor.workspaceId,
        type: 'adjustment',
        date: TODAY,
      })
    }

    // The composite foreign key is what makes this impossible.
    await expect(
      database.db.insert(transactionLines).values({
        id: '019a2c1e-0000-7000-8000-00000000b002',
        transactionId,
        workspaceId: actor.workspaceId,
        accountId: account.id,
        currency: 'USD',
        amount: '10.0000',
        baseAmount: '10.0000',
        date: TODAY,
      }),
    ).rejects.toThrow()
  })

  it('refuses a line for zero', async () => {
    const account = await createOk({
      name: 'Account',
      type: 'cash',
      openingBalance: { amount: '10.00', currency: 'TRY' },
    })
    const [row] = await database.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.workspaceId, actor.workspaceId))
      .limit(1)

    await expect(
      database.db.insert(transactionLines).values({
        id: '019a2c1e-0000-7000-8000-00000000b003',
        transactionId: row!.id,
        workspaceId: actor.workspaceId,
        accountId: account.id,
        currency: 'TRY',
        amount: '0',
        baseAmount: '0',
        date: TODAY,
      }),
    ).rejects.toThrow()
  })

  it('refuses an unknown transaction type', async () => {
    await expect(
      database.db.insert(transactions).values({
        id: '019a2c1e-0000-7000-8000-00000000b004',
        workspaceId: actor.workspaceId,
        type: 'investment',
        date: TODAY,
      }),
    ).rejects.toThrow()
  })

  it(`deletes a transaction’s lines with it`, async () => {
    const account = await createOk({
      name: 'Account',
      type: 'cash',
      openingBalance: { amount: '10.00', currency: 'TRY' },
    })
    await database.db.delete(transactions).where(eq(transactions.workspaceId, actor.workspaceId))

    const lines = await database.db
      .select()
      .from(transactionLines)
      .where(eq(transactionLines.accountId, account.id))
    expect(lines).toHaveLength(0)
  })
})

describe('the base currency', () => {
  it('cannot change once the workspace has an account', async () => {
    await createOk({ name: 'Account', type: 'cash' })
    const response = await actor.request({
      method: 'PATCH',
      url: '/api/v1/workspace/settings',
      payload: { baseCurrency: 'USD' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json<{ detail: string }>().detail).toContain('no accounts')
  })
})
