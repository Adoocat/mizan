import type {
  AccountDetailResponse,
  CategoryListResponse,
  TransactionDto,
  TransactionListResponse,
} from '@mizan/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import { accounts, transactions } from '../../db/schema/index.ts'
import { buildTestApp, type TestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import { signUpActor, type Actor } from '../../testing/session.ts'

const TODAY = '2026-10-22'

let database: Database
let harness: TestApp
let actor: Actor
/** The seeded categories, by system key. */
let category: Record<string, string>

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

/** A clean slate per test: these tests count rows and sum totals across the whole workspace. */
beforeEach(async () => {
  await database.db.delete(transactions).where(eq(transactions.workspaceId, actor.workspaceId))
  await database.db.delete(accounts).where(eq(accounts.workspaceId, actor.workspaceId))
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

const post = (payload: object) =>
  actor.request({ method: 'POST', url: '/api/v1/transactions', payload })

async function create(payload: object): Promise<TransactionDto> {
  const response = await post(payload)
  expect(response.statusCode, response.body).toBe(201)
  return response.json<TransactionDto>()
}

async function list(query = ''): Promise<TransactionListResponse> {
  const response = await actor.request({ method: 'GET', url: `/api/v1/transactions${query}` })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<TransactionListResponse>()
}

async function balanceOf(accountId: string): Promise<string> {
  const response = await actor.request({ method: 'GET', url: `/api/v1/accounts/${accountId}` })
  return response.json<AccountDetailResponse>().account.balance.amount
}

describe('recording an expense', () => {
  it('stores one negative line and moves the balance', async () => {
    const accountId = await newAccount('Garanti', { opening: '30000.00' })

    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      payee: 'Migros Kadıköy',
      parts: [{ categoryId: category.groceries, amount: tl('85.00') }],
    })

    expect(created.lines).toHaveLength(1)
    // The client sends a magnitude; the API applies the sign the type implies.
    expect(created.lines[0]!.amount.amount).toBe('-85.00')
    expect(created.total.amount).toBe('-85.00')
    expect(await balanceOf(accountId)).toBe('29915.00')
  })

  it('saves the 1,600 TL supermarket split and lands the balance on the total', async () => {
    // Phase 5's Definition of Done (PLAN §20).
    const accountId = await newAccount('Bonus', { type: 'credit_card', opening: '-4860.00' })

    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      payee: 'Migros',
      parts: [
        { categoryId: category.groceries, amount: tl('1200.00'), memo: 'Weekly shop' },
        { categoryId: category.personalCare, amount: tl('300.00') },
        { categoryId: category.other, amount: tl('100.00'), memo: 'Cleaning' },
      ],
    })

    expect(created.lines).toHaveLength(3)
    expect(created.lines.map((line) => line.amount.amount)).toEqual([
      '-1200.00',
      '-300.00',
      '-100.00',
    ])
    expect(created.total.amount).toBe('-1600.00')
    expect(created.lines.map((line) => line.memo)).toEqual(['Weekly shop', null, 'Cleaning'])
    expect(await balanceOf(accountId)).toBe('-6460.00')
  })

  it('requires a category on an on-budget account', async () => {
    const accountId = await newAccount('No category')
    const response = await post({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ amount: tl('85.00') }],
    })

    expect(response.statusCode).toBe(400)
    expect(response.json<{ detail: string }>().detail).toContain('category')
  })

  it('allows an uncategorized expense on an off-budget account', async () => {
    const accountId = await newAccount('Off budget', { onBudget: false })
    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ amount: tl('85.00') }],
    })
    expect(created.lines[0]!.categoryId).toBeNull()
  })

  it('refuses a zero or negative part', async () => {
    const accountId = await newAccount('Signs')
    for (const amount of ['0.00', '-85.00']) {
      const response = await post({
        type: 'expense',
        date: TODAY,
        accountId,
        parts: [{ categoryId: category.groceries, amount: tl(amount) }],
      })
      expect(response.statusCode, amount).toBe(400)
    }
  })

  it('refuses a category from another workspace', async () => {
    const accountId = await newAccount('Foreign category')
    const other = await signUpActor(harness.app)
    const theirs = (
      await other.request({ method: 'GET', url: '/api/v1/categories' })
    ).json<CategoryListResponse>()
    const foreign = theirs.groups.flatMap((group) => group.categories)[0]!

    const response = await post({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ categoryId: foreign.id, amount: tl('85.00') }],
    })
    expect(response.statusCode).toBe(404)
  })

  it('refuses an archived category', async () => {
    const accountId = await newAccount('Archived category')
    await actor.request({
      method: 'POST',
      url: `/api/v1/categories/${category.gifts}/archive`,
    })

    const response = await post({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ categoryId: category.gifts, amount: tl('85.00') }],
    })
    expect(response.statusCode).toBe(404)

    await actor.request({
      method: 'POST',
      url: `/api/v1/categories/${category.gifts}/unarchive`,
    })
  })

  it('answers a repeated client id with the transaction that already exists', async () => {
    const accountId = await newAccount('Double tap', { opening: '30000.00' })
    const id = crypto.randomUUID()
    const payload = {
      id,
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ categoryId: category.diningOut, amount: tl('85.00') }],
    }

    const first = await post(payload)
    const again = await post(payload)

    expect(first.statusCode).toBe(201)
    expect(again.statusCode).toBe(200)
    // The expense was recorded once, so the balance moved once.
    expect(await balanceOf(accountId)).toBe('29915.00')
  })
})

describe('income and transfers', () => {
  it('records income as a positive line', async () => {
    const accountId = await newAccount('Salary account', { opening: '30000.00' })
    const created = await create({
      type: 'income',
      date: TODAY,
      accountId,
      payee: 'Employer',
      parts: [{ categoryId: category.salary, amount: tl('50000.00') }],
    })

    expect(created.lines[0]!.amount.amount).toBe('50000.00')
    expect(await balanceOf(accountId)).toBe('80000.00')
  })

  it('moves money between two budget accounts without a category', async () => {
    const from = await newAccount('Checking', { opening: '30000.00' })
    const to = await newAccount('Savings', { type: 'savings', opening: '0.00' })

    const created = await create({
      type: 'transfer',
      date: TODAY,
      fromAccountId: from,
      toAccountId: to,
      amount: tl('10000.00'),
    })

    expect(created.lines).toHaveLength(2)
    // The two legs cancel: money moved, it was not created.
    expect(created.total.amount).toBe('0.00')
    expect(await balanceOf(from)).toBe('20000.00')
    expect(await balanceOf(to)).toBe('10000.00')
  })

  it('refuses a category on a transfer that stays inside the budget', async () => {
    const from = await newAccount('Checking', { opening: '30000.00' })
    const to = await newAccount('Savings', { type: 'savings', opening: '0.00' })

    const response = await post({
      type: 'transfer',
      date: TODAY,
      fromAccountId: from,
      toAccountId: to,
      amount: tl('10000.00'),
      categoryId: category.savingsTransfer,
    })
    expect(response.statusCode).toBe(400)
  })

  it('requires a category when money leaves the budget', async () => {
    const from = await newAccount('Checking', { opening: '30000.00' })
    const investment = await newAccount('Investment', { onBudget: false, opening: '0.00' })

    const refused = await post({
      type: 'transfer',
      date: TODAY,
      fromAccountId: from,
      toAccountId: investment,
      amount: tl('6000.00'),
    })
    expect(refused.statusCode).toBe(400)

    const created = await create({
      type: 'transfer',
      date: TODAY,
      fromAccountId: from,
      toAccountId: investment,
      amount: tl('6000.00'),
      categoryId: category.investmentContribution,
    })
    // Only the on-budget side carries the category: the plan counts the money leaving once.
    const onBudgetLine = created.lines.find((line) => line.accountId === from)
    const offBudgetLine = created.lines.find((line) => line.accountId === investment)
    expect(onBudgetLine?.categoryId).toBe(category.investmentContribution)
    expect(offBudgetLine?.categoryId).toBeNull()
  })

  it('refuses a transfer to the same account', async () => {
    const accountId = await newAccount('Only one')
    const response = await post({
      type: 'transfer',
      date: TODAY,
      fromAccountId: accountId,
      toAccountId: accountId,
      amount: tl('100.00'),
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('the list', () => {
  async function seed(): Promise<string> {
    const accountId = await newAccount('List account')
    await create({
      type: 'income',
      date: '2026-10-01',
      accountId,
      payee: 'Employer',
      parts: [{ categoryId: category.salary, amount: tl('50000.00') }],
    })
    await create({
      type: 'expense',
      date: '2026-10-05',
      accountId,
      payee: 'MİGROS KADIKÖY',
      parts: [{ categoryId: category.groceries, amount: tl('1600.00') }],
    })
    await create({
      type: 'expense',
      date: '2026-10-20',
      accountId,
      payee: 'Şişli Çarşı',
      parts: [{ categoryId: category.diningOut, amount: tl('240.50') }],
    })
    const savings = await newAccount('List savings', { type: 'savings', opening: '0.00' })
    await create({
      type: 'transfer',
      date: '2026-10-10',
      fromAccountId: accountId,
      toAccountId: savings,
      amount: tl('10000.00'),
    })
    return accountId
  }

  it('returns transactions newest first', async () => {
    await seed()
    const { transactions: rows } = await list()
    expect(rows.map((row) => row.date)).toEqual([
      '2026-10-20',
      '2026-10-10',
      '2026-10-05',
      '2026-10-01',
    ])
  })

  it('totals the whole filtered set, not just the page', async () => {
    await seed()
    const { summary } = await list('?limit=1')

    expect(summary.income.amount).toBe('50000.00')
    expect(summary.spending.amount).toBe('-1840.50')
    // Only the receiving leg of a transfer is summed; the two legs would otherwise cancel.
    expect(summary.transfers.amount).toBe('10000.00')
    expect(summary.matched).toBe(4)
    expect(summary.needsReview).toBe(0)
  })

  it('pages with a cursor and stops at the end', async () => {
    await seed()
    const first = await list('?limit=3')
    expect(first.transactions).toHaveLength(3)
    expect(first.nextCursor).not.toBeNull()

    const second = await list(`?limit=3&cursor=${encodeURIComponent(first.nextCursor!)}`)
    expect(second.transactions).toHaveLength(1)
    expect(second.nextCursor).toBeNull()

    const seen = [...first.transactions, ...second.transactions].map((row) => row.id)
    expect(new Set(seen).size).toBe(4)
  })

  it('filters by date range', async () => {
    await seed()
    const { transactions: rows } = await list('?from=2026-10-05&to=2026-10-10')
    expect(rows.map((row) => row.date)).toEqual(['2026-10-10', '2026-10-05'])
  })

  it('refuses a range that ends before it starts', async () => {
    const response = await actor.request({
      method: 'GET',
      url: '/api/v1/transactions?from=2026-10-20&to=2026-10-01',
    })
    expect(response.statusCode).toBe(400)
  })

  it('filters by category, keeping every part of a matching split', async () => {
    const accountId = await newAccount('Split filter')
    await create({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [
        { categoryId: category.groceries, amount: tl('1200.00') },
        { categoryId: category.personalCare, amount: tl('400.00') },
      ],
    })

    const { transactions: rows } = await list(`?categoryId=${category.personalCare}`)
    expect(rows).toHaveLength(1)
    // The whole split comes back, or the amounts on screen would not add up.
    expect(rows[0]!.lines).toHaveLength(2)
  })

  it('filters by account', async () => {
    const accountId = await seed()
    const { transactions: rows } = await list(`?accountId=${accountId}`)
    expect(rows).toHaveLength(4)

    const other = await newAccount('Elsewhere')
    const { transactions: none } = await list(`?accountId=${other}`)
    expect(none).toHaveLength(0)
  })

  it('finds a payee across Turkish casing and diacritics', async () => {
    await seed()

    for (const query of ['migros', 'MIGROS', 'kadıköy', 'KADIKOY', 'kadikoy']) {
      const { transactions: rows } = await list(`?q=${encodeURIComponent(query)}`)
      expect(
        rows.map((row) => row.payee),
        query,
      ).toEqual(['MİGROS KADIKÖY'])
    }

    for (const query of ['sisli', 'ŞİŞLİ', 'carsi']) {
      const { transactions: rows } = await list(`?q=${encodeURIComponent(query)}`)
      expect(
        rows.map((row) => row.payee),
        query,
      ).toEqual(['Şişli Çarşı'])
    }
  })

  it('searches notes and memos too', async () => {
    const accountId = await newAccount('Memo search')
    await create({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ categoryId: category.other, amount: tl('50.00'), memo: 'Öğrenci indirimi' }],
    })

    const { transactions: rows } = await list('?q=ogrenci')
    expect(rows).toHaveLength(1)
  })

  it('filters by view', async () => {
    await seed()
    expect((await list('?view=spending')).transactions).toHaveLength(2)
    expect((await list('?view=income')).transactions).toHaveLength(1)
    expect((await list('?view=transfers')).transactions).toHaveLength(1)
    expect((await list('?view=all')).transactions).toHaveLength(4)
  })

  it('lists what needs review and counts it in the summary', async () => {
    const onBudget = await newAccount('Needs review')
    const offBudget = await newAccount('Off budget', { onBudget: false, opening: '0.00' })

    await create({
      type: 'expense',
      date: TODAY,
      accountId: offBudget,
      parts: [{ amount: tl('20.00') }],
    })
    await create({
      type: 'expense',
      date: TODAY,
      accountId: onBudget,
      parts: [{ categoryId: category.groceries, amount: tl('30.00') }],
    })

    // Uncategorized, but on an off-budget account, so the plan never needed a category.
    expect((await list('?view=needsReview')).transactions).toHaveLength(0)
    expect((await list()).summary.needsReview).toBe(0)
  })

  it('filters by amount, in or out', async () => {
    await seed()
    const big = await list('?minAmount=5000')
    // The 50,000 income and the 10,000 transfer.
    expect(big.transactions).toHaveLength(2)

    const small = await list('?maxAmount=300')
    expect(small.transactions.map((row) => row.payee)).toEqual(['Şişli Çarşı'])
  })

  it('leaves another workspace out of every total', async () => {
    await seed()
    const other = await signUpActor(harness.app)
    const theirAccount = await other.request({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: 'Theirs', type: 'cash', openingBalance: tl('999999.00') },
    })
    const theirCategories = (
      await other.request({ method: 'GET', url: '/api/v1/categories' })
    ).json<CategoryListResponse>()
    const theirCategory = theirCategories.groups.flatMap((group) => group.categories)[0]!

    await other.request({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {
        type: 'expense',
        date: TODAY,
        accountId: theirAccount.json<{ id: string }>().id,
        parts: [{ categoryId: theirCategory.id, amount: tl('777.00') }],
      },
    })

    const { summary, transactions: rows } = await list()
    expect(rows).toHaveLength(4)
    expect(summary.spending.amount).toBe('-1840.50')
  })
})

describe('editing', () => {
  it('replaces the amount, the category and the date', async () => {
    const accountId = await newAccount('Edit me', { opening: '30000.00' })
    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      payee: 'Migros',
      parts: [{ categoryId: category.groceries, amount: tl('85.00') }],
    })

    const response = await actor.request({
      method: 'PUT',
      url: `/api/v1/transactions/${created.id}`,
      payload: {
        type: 'expense',
        date: '2026-10-21',
        accountId,
        payee: 'Carrefour',
        parts: [{ categoryId: category.diningOut, amount: tl('120.00') }],
      },
    })
    expect(response.statusCode, response.body).toBe(200)

    const updated = response.json<TransactionDto>()
    expect(updated.date).toBe('2026-10-21')
    expect(updated.payee).toBe('Carrefour')
    expect(updated.lines).toHaveLength(1)
    expect(updated.lines[0]!.amount.amount).toBe('-120.00')
    expect(updated.lines[0]!.categoryId).toBe(category.diningOut)
    expect(await balanceOf(accountId)).toBe('29880.00')
  })

  it('turns a single expense into a split and back', async () => {
    const accountId = await newAccount('Split later', { opening: '30000.00' })
    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ categoryId: category.groceries, amount: tl('1600.00') }],
    })

    const split = await actor.request({
      method: 'PUT',
      url: `/api/v1/transactions/${created.id}`,
      payload: {
        type: 'expense',
        date: TODAY,
        accountId,
        parts: [
          { categoryId: category.groceries, amount: tl('1200.00') },
          { categoryId: category.personalCare, amount: tl('400.00') },
        ],
      },
    })
    expect(split.json<TransactionDto>().lines).toHaveLength(2)
    // The total did not change, so neither did the balance.
    expect(await balanceOf(accountId)).toBe('28400.00')

    const back = await actor.request({
      method: 'PUT',
      url: `/api/v1/transactions/${created.id}`,
      payload: {
        type: 'expense',
        date: TODAY,
        accountId,
        parts: [{ categoryId: category.groceries, amount: tl('1600.00') }],
      },
    })
    expect(back.json<TransactionDto>().lines).toHaveLength(1)
    expect(await balanceOf(accountId)).toBe('28400.00')
  })

  it('corrects an expense that should have been a transfer', async () => {
    const from = await newAccount('Checking', { opening: '30000.00' })
    const to = await newAccount('Savings', { type: 'savings', opening: '0.00' })
    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId: from,
      parts: [{ categoryId: category.savingsTransfer, amount: tl('10000.00') }],
    })

    const response = await actor.request({
      method: 'PUT',
      url: `/api/v1/transactions/${created.id}`,
      payload: {
        type: 'transfer',
        date: TODAY,
        fromAccountId: from,
        toAccountId: to,
        amount: tl('10000.00'),
      },
    })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<TransactionDto>().type).toBe('transfer')
    expect(await balanceOf(to)).toBe('10000.00')
  })

  it('refuses to edit an opening balance or a reconciliation', async () => {
    const accountId = await newAccount('Untouchable', { opening: '30000.00' })
    await actor.request({
      method: 'POST',
      url: `/api/v1/accounts/${accountId}/reconcile`,
      payload: { statementBalance: tl('30250.75') },
    })

    const { transactions: rows } = await list()
    for (const row of rows) {
      const response = await actor.request({
        method: 'PUT',
        url: `/api/v1/transactions/${row.id}`,
        payload: {
          type: 'expense',
          date: TODAY,
          accountId,
          parts: [{ categoryId: category.other, amount: tl('1.00') }],
        },
      })
      expect(response.statusCode, row.type).toBe(409)
    }
  })

  it('leaves a rejected edit with the transaction untouched', async () => {
    const accountId = await newAccount('Atomic', { opening: '30000.00' })
    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ categoryId: category.groceries, amount: tl('1600.00') }],
    })

    const response = await actor.request({
      method: 'PUT',
      url: `/api/v1/transactions/${created.id}`,
      // No category on an on-budget expense: refused by the ledger invariants.
      payload: { type: 'expense', date: TODAY, accountId, parts: [{ amount: tl('99.00') }] },
    })
    expect(response.statusCode).toBe(400)

    const after = await actor.request({ method: 'GET', url: `/api/v1/transactions/${created.id}` })
    expect(after.json<TransactionDto>().lines[0]!.amount.amount).toBe('-1600.00')
    expect(await balanceOf(accountId)).toBe('28400.00')
  })
})

describe('deleting and undo', () => {
  it('hides a deleted transaction and gives its money back', async () => {
    const accountId = await newAccount('Delete me', { opening: '30000.00' })
    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ categoryId: category.groceries, amount: tl('85.00') }],
    })

    const deleted = await actor.request({
      method: 'DELETE',
      url: `/api/v1/transactions/${created.id}`,
    })
    expect(deleted.statusCode, deleted.body).toBe(200)
    expect(deleted.json<TransactionDto>().deletedAt).not.toBeNull()

    expect((await list()).transactions).toHaveLength(1) // the opening balance only
    expect(await balanceOf(accountId)).toBe('30000.00')
  })

  it('restores it exactly as it was', async () => {
    const accountId = await newAccount('Undo me', { opening: '30000.00' })
    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [
        { categoryId: category.groceries, amount: tl('1200.00') },
        { categoryId: category.personalCare, amount: tl('400.00') },
      ],
    })

    await actor.request({ method: 'DELETE', url: `/api/v1/transactions/${created.id}` })
    const restored = await actor.request({
      method: 'POST',
      url: `/api/v1/transactions/${created.id}/restore`,
    })
    expect(restored.statusCode, restored.body).toBe(200)

    const back = restored.json<TransactionDto>()
    expect(back.deletedAt).toBeNull()
    expect(back.lines).toHaveLength(2)
    expect(back.total.amount).toBe('-1600.00')
    expect(await balanceOf(accountId)).toBe('28400.00')
  })

  it('refuses to delete twice, or to restore what is not deleted', async () => {
    const accountId = await newAccount('Once')
    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ categoryId: category.other, amount: tl('5.00') }],
    })

    const restoreLive = await actor.request({
      method: 'POST',
      url: `/api/v1/transactions/${created.id}/restore`,
    })
    expect(restoreLive.statusCode).toBe(409)

    await actor.request({ method: 'DELETE', url: `/api/v1/transactions/${created.id}` })
    const again = await actor.request({
      method: 'DELETE',
      url: `/api/v1/transactions/${created.id}`,
    })
    expect(again.statusCode).toBe(409)
  })

  it('refuses to delete an opening balance', async () => {
    const accountId = await newAccount('Opening', { opening: '30000.00' })
    const { transactions: rows } = await list()
    const opening = rows.find((row) => row.type === 'opening_balance')

    const response = await actor.request({
      method: 'DELETE',
      url: `/api/v1/transactions/${opening?.id}`,
    })
    expect(response.statusCode).toBe(409)
    expect(await balanceOf(accountId)).toBe('30000.00')
  })

  it('keeps a deleted transaction out of the summary', async () => {
    const accountId = await newAccount('Summary')
    const created = await create({
      type: 'expense',
      date: TODAY,
      accountId,
      parts: [{ categoryId: category.groceries, amount: tl('85.00') }],
    })

    expect((await list()).summary.spending.amount).toBe('-85.00')
    await actor.request({ method: 'DELETE', url: `/api/v1/transactions/${created.id}` })
    expect((await list()).summary.spending.amount).toBe('0.00')
  })
})
