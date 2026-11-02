import type {
  CategoryListResponse,
  ConfirmOccurrenceResponse,
  GoalResponse,
  OccurrenceResponse,
  PlanResponse,
  PrefillPlanResponse,
  RecurringListResponse,
  RecurringRuleDto,
  RuleOccurrencesResponse,
  TransactionListResponse,
  UpcomingResponse,
} from '@mizan/contracts'
import { fixedClock, Money } from '@mizan/domain'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import {
  accounts,
  goals,
  planPeriods,
  recurringRules,
  transactions,
} from '../../db/schema/index.ts'
import { buildTestApp, type TestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import { signUpActor, type Actor } from '../../testing/session.ts'
import { rollRepeatingSinkingFunds, runAutoPost } from './jobs.ts'

/**
 * Phase 9's definition of done, over the API: the seven-day upcoming total is right, and
 * confirming an occurrence creates exactly one transaction (PLAN §20, §11).
 *
 * The clock is pinned to Thursday 22 October 2026, the day the mockups depict. Every state an
 * occurrence can be in is a function of what today is, so a floating clock would make half of
 * these tests mean something different tomorrow.
 */
const TODAY = '2026-10-22'
const START = '2026-10-01'

let database: Database
let harness: TestApp
let actor: Actor
let category: Record<string, string>
/** The group each system category sits in, for the test that adds a subcategory. */
let groupOfCategory: Record<string, string>
let checking: string
let savings: string

const tl = (amount: string) => ({ amount, currency: 'TRY' as const })
const try_ = (amount: string) => Money.of(amount, 'TRY')

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
  groupOfCategory = Object.fromEntries(
    groups.flatMap((group) =>
      group.categories.filter((one) => one.systemKey).map((one) => [one.systemKey!, group.id]),
    ),
  )
})

afterAll(async () => {
  await harness?.close()
  await database?.close()
})

beforeEach(async () => {
  await database.db.delete(planPeriods).where(eq(planPeriods.workspaceId, actor.workspaceId))
  await database.db.delete(transactions).where(eq(transactions.workspaceId, actor.workspaceId))
  await database.db.delete(recurringRules).where(eq(recurringRules.workspaceId, actor.workspaceId))
  await database.db.delete(goals).where(eq(goals.workspaceId, actor.workspaceId))
  await database.db.delete(accounts).where(eq(accounts.workspaceId, actor.workspaceId))

  checking = (
    await actor.request({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: 'Garanti', type: 'checking', openingBalance: tl('24850.00') },
    })
  ).json<{ id: string }>().id

  savings = (
    await actor.request({
      method: 'POST',
      url: '/api/v1/accounts',
      payload: { name: 'Savings', type: 'savings', openingBalance: tl('0.00') },
    })
  ).json<{ id: string }>().id
})

/* ------------------------------------------------------------------- helpers */

async function createRule(payload: Record<string, unknown>): Promise<RecurringRuleDto> {
  const response = await actor.request({ method: 'POST', url: '/api/v1/recurring', payload })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<RecurringRuleDto>()
}

/** The ₺549 internet bill from the mockups: a plain fixed monthly expense. */
async function internetBill(overrides: Record<string, unknown> = {}): Promise<RecurringRuleDto> {
  return createRule({
    kind: 'expense',
    name: 'Turkcell Superonline',
    amount: tl('549.00'),
    freq: 'monthly',
    startDate: '2026-10-23',
    accountId: checking,
    categoryId: category.utilities,
    ...overrides,
  })
}

async function listRules(): Promise<RecurringListResponse> {
  const response = await actor.request({ method: 'GET', url: '/api/v1/recurring' })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<RecurringListResponse>()
}

async function occurrencesOf(id: string, query = ''): Promise<RuleOccurrencesResponse> {
  const response = await actor.request({
    method: 'GET',
    url: `/api/v1/recurring/${id}/occurrences${query}`,
  })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<RuleOccurrencesResponse>()
}

async function upcoming(days = 7): Promise<UpcomingResponse> {
  const response = await actor.request({ method: 'GET', url: `/api/v1/upcoming?days=${days}` })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<UpcomingResponse>()
}

async function confirm(
  id: string,
  date: string,
  payload: Record<string, unknown> = {},
): Promise<ConfirmOccurrenceResponse> {
  const response = await actor.request({
    method: 'POST',
    url: `/api/v1/recurring/${id}/occurrences/${date}/confirm`,
    payload,
  })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<ConfirmOccurrenceResponse>()
}

async function readPlan(start = START): Promise<PlanResponse> {
  const response = await actor.request({ method: 'GET', url: `/api/v1/plans/${start}` })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<PlanResponse>()
}

async function allocate(categoryId: string | undefined, planned: string, start = START) {
  const response = await actor.request({
    method: 'PUT',
    url: `/api/v1/plans/${start}/lines`,
    payload: { target: 'category', categoryId, planned: tl(planned) },
  })
  expect(response.statusCode, response.body).toBe(200)
}

async function listTransactions(): Promise<TransactionListResponse> {
  const response = await actor.request({ method: 'GET', url: '/api/v1/transactions' })
  expect(response.statusCode, response.body).toBe(200)
  return response.json<TransactionListResponse>()
}

/**
 * Only the transactions the rules wrote.
 *
 * Opening a test account writes an `opening_balance` transaction of its own, and "exactly one
 * transaction" is a claim about what confirming an occurrence produced.
 */
async function postedTransactions(): Promise<TransactionListResponse['transactions']> {
  return (await listTransactions()).transactions.filter((one) => one.source === 'recurring')
}

/* ------------------------------------------------------------------- rules */

describe('writing a rule', () => {
  it('creates one and derives what the schedule implies', async () => {
    const rule = await internetBill()

    expect(rule.kind).toBe('expense')
    expect(rule.interval).toBe(1)
    expect(rule.weekendPolicy).toBe('none')
    expect(rule.amountMode).toBe('fixed')
    expect(rule.autoPost).toBe(false)
    // A new rule is its own series; a "this and future" edit adds to it later.
    expect(rule.seriesId).toBe(rule.id)
    expect(rule.finished).toBe(false)
    expect(rule.nextDueDate).toBe('2026-10-23')
    expect(rule.monthlyEquivalent).toEqual(tl('549.00'))
    expect(rule.lastDate).toBeNull()
  })

  it('is idempotent on a client-supplied id', async () => {
    const id = '019a2c1e-0000-7000-8000-00000000d001'
    await internetBill({ id })

    const again = await actor.request({
      method: 'POST',
      url: '/api/v1/recurring',
      payload: {
        id,
        kind: 'expense',
        name: 'Something else entirely',
        amount: tl('1.00'),
        freq: 'monthly',
        startDate: '2026-10-23',
        accountId: checking,
        categoryId: category.utilities,
      },
    })
    // A repeat of the same id is not a new rule, so it answers 200 and changes nothing.
    expect(again.statusCode).toBe(200)
    expect(again.json<RecurringRuleDto>().name).toBe('Turkcell Superonline')
    expect((await listRules()).rules).toHaveLength(1)
  })

  it('states what a month of each frequency costs', async () => {
    await internetBill()
    await createRule({
      kind: 'expense',
      name: 'Kasko insurance',
      amount: tl('6000.00'),
      freq: 'yearly',
      startDate: '2027-03-01',
      accountId: checking,
      categoryId: category.utilities,
    })

    const { rules, committedMonthly } = await listRules()
    const byName = new Map(rules.map((rule) => [rule.name, rule]))
    expect(byName.get('Kasko insurance')?.monthlyEquivalent).toEqual(tl('500.00'))
    // 549 + 500: a yearly premium and a monthly bill, made comparable.
    expect(committedMonthly).toEqual(tl('1049.00'))
  })

  it('refuses a rule whose shape makes no sense', async () => {
    const refuse = async (payload: Record<string, unknown>, status = 400) => {
      const response = await actor.request({ method: 'POST', url: '/api/v1/recurring', payload })
      expect(response.statusCode, response.body).toBe(status)
      return response
    }

    const base = {
      kind: 'expense' as const,
      name: 'Rent',
      amount: tl('11500.00'),
      freq: 'monthly' as const,
      startDate: START,
      accountId: checking,
      categoryId: category.rent,
    }

    // An estimate cannot post itself: there would be nobody to notice the guess was wrong.
    await refuse({ ...base, amountMode: 'estimated', autoPost: true })
    // Only a monthly rule has a day of the month.
    await refuse({ ...base, freq: 'weekly', byMonthDay: 15 })
    // A transfer needs two different accounts.
    await refuse({ ...base, kind: 'transfer', categoryId: undefined, toAccountId: checking })
    // An on-budget payment needs a category, the same way the transaction it becomes does, and
    // that is refused when the rule is written rather than a month later at the Confirm button.
    await refuse({ ...base, categoryId: undefined })

    // The same holds for one funded from a goal: it is still spending, and still classified (§9).
    const goal = await actor.request({
      method: 'POST',
      url: '/api/v1/goals',
      payload: {
        type: 'sinking_fund',
        name: 'Insurance',
        target: tl('6000.00'),
        targetDate: '2027-03-01',
      },
    })
    await refuse({ ...base, categoryId: undefined, goalId: goal.json<{ id: string }>().id })
  })

  it('refuses an account or category that is not the caller’s', async () => {
    const stranger = await signUpActor(harness.app, { name: 'Stranger' })
    const theirAccount = (
      await stranger.request({
        method: 'POST',
        url: '/api/v1/accounts',
        payload: { name: 'Theirs', type: 'checking', openingBalance: tl('1.00') },
      })
    ).json<{ id: string }>().id

    const response = await actor.request({
      method: 'POST',
      url: '/api/v1/recurring',
      payload: {
        kind: 'expense',
        name: 'Rent',
        amount: tl('11500.00'),
        freq: 'monthly',
        startDate: START,
        accountId: theirAccount,
        categoryId: category.rent,
      },
    })
    // 404, not 403: a 403 would confirm the account exists.
    expect(response.statusCode).toBe(404)
  })
})

describe('editing a rule', () => {
  it('edits the whole series in place', async () => {
    const rule = await internetBill()
    const response = await actor.request({
      method: 'PATCH',
      url: `/api/v1/recurring/${rule.id}`,
      payload: { amount: tl('599.00'), name: 'Superonline fibre' },
    })
    expect(response.statusCode, response.body).toBe(200)

    const updated = response.json<RecurringRuleDto>()
    expect(updated.amount).toEqual(tl('599.00'))
    expect(updated.name).toBe('Superonline fibre')
    expect((await listRules()).rules).toHaveLength(1)
  })

  it('splits the series for "this and future", keeping the old months as they were', async () => {
    const rent = await createRule({
      kind: 'expense',
      name: 'Rent',
      amount: tl('11500.00'),
      freq: 'monthly',
      startDate: '2026-01-01',
      accountId: checking,
      categoryId: category.rent,
    })

    const response = await actor.request({
      method: 'PATCH',
      url: `/api/v1/recurring/${rent.id}`,
      payload: { scope: 'future', from: '2026-11-01', amount: tl('12500.00') },
    })
    expect(response.statusCode, response.body).toBe(200)

    const next = response.json<RecurringRuleDto>()
    expect(next.id).not.toBe(rent.id)
    // One series, two rules: the rent is still "the rent" to the user.
    expect(next.seriesId).toBe(rent.seriesId)
    expect(next.startDate).toBe('2026-11-01')
    expect(next.amount).toEqual(tl('12500.00'))

    const { rules } = await listRules()
    expect(rules).toHaveLength(2)
    const old = rules.find((one) => one.id === rent.id)!
    // The old rule stops the day before, so October is still ₺11,500 and November is ₺12,500.
    expect(old.endDate).toBe('2026-10-31')
    expect(old.amount).toEqual(tl('11500.00'))
    expect(
      (await occurrencesOf(old.id, '?from=2026-10-01&to=2026-12-31')).occurrences,
    ).toHaveLength(1)
  })

  it('keeps the series on its own dates when the split changes nothing about the schedule', async () => {
    // The 15th is not a series date; the split still lands on the next occurrence, the 23rd.
    const rule = await internetBill()
    const response = await actor.request({
      method: 'PATCH',
      url: `/api/v1/recurring/${rule.id}`,
      payload: { scope: 'future', from: '2026-11-15', amount: tl('599.00') },
    })
    expect(response.json<RecurringRuleDto>().startDate).toBe('2026-11-23')
  })

  it('edits in place when the split would leave nothing behind', async () => {
    const rule = await internetBill()
    const response = await actor.request({
      method: 'PATCH',
      url: `/api/v1/recurring/${rule.id}`,
      payload: { scope: 'future', from: '2026-01-01', amount: tl('599.00') },
    })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json<RecurringRuleDto>().id).toBe(rule.id)
    expect((await listRules()).rules).toHaveLength(1)
  })

  it('refuses a "this and future" edit with no occurrence left to change', async () => {
    const rule = await internetBill({ maxCount: 2 })
    const response = await actor.request({
      method: 'PATCH',
      url: `/api/v1/recurring/${rule.id}`,
      payload: { scope: 'future', from: '2030-01-01', amount: tl('599.00') },
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('pausing, ending and deleting', () => {
  it('suppresses occurrences for the window it was paused for', async () => {
    const rule = await internetBill()
    const paused = await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/pause`,
      payload: { until: '2027-01-01' },
    })
    expect(paused.statusCode, paused.body).toBe(200)
    expect(paused.json<RecurringRuleDto>().status).toBe('paused')
    expect(paused.json<RecurringRuleDto>().pausedFrom).toBe(TODAY)
    // The next thing it expects is the first occurrence after the pause ends.
    expect(paused.json<RecurringRuleDto>().nextDueDate).toBe('2027-01-23')
    expect((await upcoming(30)).occurrences).toHaveLength(0)

    const resumed = await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/resume`,
    })
    expect(resumed.json<RecurringRuleDto>().status).toBe('active')
    // Resuming clears the window, which the check constraint also insists on.
    expect(resumed.json<RecurringRuleDto>().pausedFrom).toBeNull()
    expect((await upcoming(30)).occurrences).toHaveLength(1)
  })

  it('ends a series without touching what it already did', async () => {
    const rule = await internetBill({ startDate: '2026-09-23' })
    await confirm(rule.id, '2026-09-23')

    const ended = await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/end`,
      payload: { on: '2026-10-01' },
    })
    expect(ended.statusCode, ended.body).toBe(200)
    expect(ended.json<RecurringRuleDto>().finished).toBe(true)
    expect(ended.json<RecurringRuleDto>().nextDueDate).toBeNull()
    // The transaction it posted in September stays: the money moved.
    expect(await postedTransactions()).toHaveLength(1)
  })

  it('refuses to end a rule before it starts', async () => {
    const rule = await internetBill({ startDate: '2027-01-01' })
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/end`,
      payload: { on: '2026-01-01' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('deletes a rule and leaves its posted transactions standing', async () => {
    const rule = await internetBill({ startDate: '2026-09-23' })
    await confirm(rule.id, '2026-09-23')

    const response = await actor.request({
      method: 'DELETE',
      url: `/api/v1/recurring/${rule.id}`,
    })
    expect(response.statusCode, response.body).toBe(204)
    expect((await listRules()).rules).toHaveLength(0)

    const [transaction] = await postedTransactions()
    expect(transaction?.total).toEqual(tl('-549.00'))
    expect(transaction?.source).toBe('recurring')
  })
})

/* -------------------------------------------------------------- occurrences */

describe('expanding a rule into occurrences', () => {
  it('clamps a day-31 rule to the end of every shorter month', async () => {
    const rule = await internetBill({ startDate: '2026-01-31', byMonthDay: 31 })
    const { occurrences } = await occurrencesOf(rule.id, '?from=2026-01-01&to=2026-04-30')
    expect(occurrences.map((one) => one.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('moves a weekend due date while keeping the occurrence’s own identity', async () => {
    // 2026-11-01 is a Sunday.
    const rule = await internetBill({
      startDate: '2026-11-01',
      weekendPolicy: 'next_business_day',
    })
    const [occurrence] = (await occurrencesOf(rule.id, '?from=2026-11-01&to=2026-11-30'))
      .occurrences
    expect(occurrence?.originalDate).toBe('2026-11-01')
    expect(occurrence?.dueDate).toBe('2026-11-02')
  })

  it('refuses a date the series never falls on', async () => {
    const rule = await internetBill()
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-24/skip`,
    })
    expect(response.statusCode).toBe(404)
  })

  it('refuses a window longer than it will serve', async () => {
    const rule = await internetBill()
    const response = await actor.request({
      method: 'GET',
      url: `/api/v1/recurring/${rule.id}/occurrences?from=2026-01-01&to=2030-01-01`,
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('skipping and overriding one occurrence', () => {
  it('skips the month the gym was closed, and puts it back', async () => {
    const rule = await internetBill()
    const skipped = await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-23/skip`,
    })
    expect(skipped.statusCode, skipped.body).toBe(200)
    expect(skipped.json<OccurrenceResponse>().occurrence.state).toBe('skipped')
    expect((await upcoming()).occurrences).toHaveLength(0)

    // Skipping twice is still a skip: the user is restating their intent.
    await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-23/skip`,
    })

    const cleared = await actor.request({
      method: 'DELETE',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-23/exception`,
    })
    expect(cleared.statusCode, cleared.body).toBe(200)
    expect(cleared.json<OccurrenceResponse>().occurrence.state).toBe('upcoming')
    expect((await upcoming()).occurrences).toHaveLength(1)
  })

  it('overrides one occurrence’s date and amount, leaving the next alone', async () => {
    const rule = await internetBill()
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-23/override`,
      payload: { date: '2026-10-26', amount: tl('612.40') },
    })
    expect(response.statusCode, response.body).toBe(200)

    const { occurrence } = response.json<OccurrenceResponse>()
    expect(occurrence.originalDate).toBe('2026-10-23')
    expect(occurrence.dueDate).toBe('2026-10-26')
    expect(occurrence.amount).toEqual(tl('612.40'))
    expect(occurrence.overridden).toBe(true)

    // November is untouched: an override is about one occurrence, never the series.
    const { occurrences } = await occurrencesOf(rule.id, '?from=2026-11-01&to=2026-11-30')
    expect(occurrences[0]?.amount).toEqual(tl('549.00'))
    expect(occurrences[0]?.overridden).toBe(false)
  })

  it('treats an overridden amount as no longer an estimate', async () => {
    const rule = await internetBill({ amountMode: 'estimated' })
    expect((await upcoming()).occurrences[0]?.estimated).toBe(true)

    await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-23/override`,
      payload: { amount: tl('812.40') },
    })
    expect((await upcoming()).occurrences[0]?.estimated).toBe(false)
  })

  it('refuses to clear an exception that is not there', async () => {
    const rule = await internetBill()
    const response = await actor.request({
      method: 'DELETE',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-23/exception`,
    })
    expect(response.statusCode).toBe(404)
  })
})

/* ---------------------------------------------------------------- confirming */

describe('confirming an occurrence', () => {
  it('creates exactly one transaction, however many times it is asked', async () => {
    const rule = await internetBill()

    const first = await confirm(rule.id, '2026-10-23')
    expect(first.alreadyPosted).toBe(false)
    expect(first.occurrence.state).toBe('posted')

    // §20's definition of done for this phase. A double tap, or a retry, must not pay twice.
    const second = await confirm(rule.id, '2026-10-23')
    expect(second.alreadyPosted).toBe(true)
    expect(second.transactionId).toBe(first.transactionId)

    const rows = await postedTransactions()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(first.transactionId)
    expect(rows[0]?.total).toEqual(tl('-549.00'))
    expect(rows[0]?.date).toBe('2026-10-23')
    expect(rows[0]?.source).toBe('recurring')
  })

  it('records the amount that actually arrived, not the estimate', async () => {
    const rule = await internetBill({ amountMode: 'estimated', name: 'Enerjisa Electricity' })
    const confirmed = await confirm(rule.id, '2026-10-23', { amount: tl('812.40') })

    expect(confirmed.occurrence.amount).toEqual(tl('549.00'))
    const [transaction] = await postedTransactions()
    // The ledger holds what happened; the rule keeps its estimate for next month.
    expect(transaction?.total).toEqual(tl('-812.40'))
  })

  it('hands the occurrence back when the transaction is deleted', async () => {
    const rule = await internetBill()
    const confirmed = await confirm(rule.id, '2026-10-23')
    expect((await upcoming()).occurrences).toHaveLength(0)

    const deleted = await actor.request({
      method: 'DELETE',
      url: `/api/v1/transactions/${confirmed.transactionId}`,
    })
    expect(deleted.statusCode, deleted.body).toBe(200)

    // Undoing a confirm gives the occurrence back as due, with nothing left to clean up.
    const after = await upcoming()
    expect(after.occurrences).toHaveLength(1)
    expect(after.occurrences[0]?.state).toBe('upcoming')

    // And it can be confirmed again, which the partial unique index is what allows.
    const again = await confirm(rule.id, '2026-10-23')
    expect(again.alreadyPosted).toBe(false)
    expect(again.transactionId).not.toBe(confirmed.transactionId)
  })

  it('refuses to confirm what was skipped', async () => {
    const rule = await internetBill()
    await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-23/skip`,
    })
    const response = await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-23/confirm`,
      payload: {},
    })
    expect(response.statusCode).toBe(409)
  })

  it('refuses to skip or override something already recorded', async () => {
    const rule = await internetBill()
    await confirm(rule.id, '2026-10-23')

    for (const action of ['skip', 'override']) {
      const response = await actor.request({
        method: 'POST',
        url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-23/${action}`,
        payload: { amount: tl('1.00') },
      })
      expect(response.statusCode, response.body).toBe(409)
    }
  })

  it('records a transfer and its goal contribution together', async () => {
    const goal = (
      await actor.request({
        method: 'POST',
        url: '/api/v1/goals',
        payload: {
          type: 'savings',
          name: 'Japan trip',
          target: tl('35000.00'),
          targetDate: '2027-07-15',
          keptInAccountId: savings,
        },
      })
    ).json<{ id: string }>()

    const rule = await createRule({
      kind: 'transfer',
      name: 'Japan trip saving',
      amount: tl('2000.00'),
      freq: 'monthly',
      startDate: '2026-10-23',
      accountId: checking,
      toAccountId: savings,
      goalId: goal.id,
    })

    const confirmed = await confirm(rule.id, '2026-10-23')
    const [transaction] = (await listTransactions()).transactions
    expect(transaction?.type).toBe('transfer')
    expect(transaction?.lines).toHaveLength(2)

    const after = (
      await actor.request({ method: 'GET', url: `/api/v1/goals/${goal.id}` })
    ).json<GoalResponse>()
    // §11's auto-transfer-to-goals: the money moved and the earmark was recorded in one step.
    expect(after.goal.saved).toEqual(tl('2000.00'))
    expect(after.contributions).toHaveLength(1)
    expect(after.contributions[0]?.source).toBe('transfer')
    expect(after.contributions[0]?.transactionId).toBe(confirmed.transactionId)
  })

  it('draws a goal-funded expense out of its sinking fund', async () => {
    const goal = (
      await actor.request({
        method: 'POST',
        url: '/api/v1/goals',
        payload: {
          type: 'sinking_fund',
          name: 'Kasko insurance',
          target: tl('6000.00'),
          targetDate: '2026-10-23',
        },
      })
    ).json<{ id: string }>()
    await actor.request({
      method: 'POST',
      url: `/api/v1/goals/${goal.id}/contributions`,
      payload: { amount: tl('6000.00'), date: '2026-10-01' },
    })

    const rule = await createRule({
      kind: 'expense',
      name: 'Kasko premium',
      amount: tl('6000.00'),
      freq: 'yearly',
      startDate: '2026-10-23',
      accountId: checking,
      categoryId: category.utilities,
      goalId: goal.id,
    })
    await confirm(rule.id, '2026-10-23')

    const after = (
      await actor.request({ method: 'GET', url: `/api/v1/goals/${goal.id}` })
    ).json<GoalResponse>()
    // The money was earmarked in earlier months, so paying the bill draws the fund down.
    expect(after.goal.spent).toEqual(tl('6000.00'))
    expect(after.goal.saved).toEqual(tl('0.00'))
  })
})

/* ------------------------------------------------------------------ upcoming */

describe('the upcoming list', () => {
  beforeEach(async () => {
    // The mockup's week: four bills inside seven days, one of them already overdue.
    await internetBill({ name: 'Turkcell Superonline', startDate: '2026-10-23' })
    await createRule({
      kind: 'expense',
      name: 'Spotify Premium',
      amount: tl('99.00'),
      freq: 'monthly',
      startDate: '2026-10-24',
      accountId: checking,
      categoryId: category.subscriptions,
    })
    await createRule({
      kind: 'expense',
      name: 'İSKİ Water',
      amount: tl('310.00'),
      freq: 'monthly',
      startDate: '2026-10-19',
      accountId: checking,
      categoryId: category.utilities,
    })
    await createRule({
      kind: 'income',
      name: 'Salary',
      amount: tl('46000.00'),
      freq: 'monthly',
      startDate: '2026-10-25',
      accountId: checking,
      categoryId: category.salary,
    })
  })

  it('totals the next seven days and separates what was missed', async () => {
    const result = await upcoming(7)

    expect(result.today).toBe(TODAY)
    expect(result.to).toBe('2026-10-28')
    expect(result.occurrences.map((one) => one.ruleName)).toEqual([
      'Turkcell Superonline',
      'Spotify Premium',
      'Salary',
    ])
    // The phase's definition of done: 549 + 99, with the salary counted as income, not a bill.
    expect(result.dueTotal).toEqual(tl('648.00'))
    expect(result.incomeTotal).toEqual(tl('46000.00'))
    expect(result.nextIncome?.ruleName).toBe('Salary')

    expect(result.overdue).toHaveLength(1)
    expect(result.overdue[0]?.ruleName).toBe('İSKİ Water')
    expect(result.overdue[0]?.state).toBe('overdue')
    // Due the 19th, read on the 22nd.
    expect(result.overdue[0]?.overdueDays).toBe(3)
    expect(result.overdueTotal).toEqual(tl('310.00'))
  })

  it('says what checking will hold once it has all happened', async () => {
    const result = await upcoming(7)

    expect(result.onBudgetBalance).toEqual(tl('24850.00'))
    // 24,850 − 549 − 99 − 310 overdue + 46,000 salary.
    expect(result.balanceAfterUpcoming).toEqual(
      try_('24850.00').minus(try_('958.00')).plus(try_('46000.00')).toDto(),
    )
  })

  it('counts a transfer inside the budget as nothing', async () => {
    await createRule({
      kind: 'transfer',
      name: 'To savings',
      amount: tl('5000.00'),
      freq: 'monthly',
      startDate: '2026-10-24',
      accountId: checking,
      toAccountId: savings,
    })

    const result = await upcoming(7)
    expect(result.transferTotal).toEqual(tl('5000.00'))
    // Moving money to savings is not spending it, so the figure does not move.
    expect(result.balanceAfterUpcoming).toEqual(
      try_('24850.00').minus(try_('958.00')).plus(try_('46000.00')).toDto(),
    )
  })

  it('drops an occurrence from the list once it is confirmed', async () => {
    const { rules } = await listRules()
    const water = rules.find((one) => one.name === 'İSKİ Water')!
    await confirm(water.id, '2026-10-19')

    const result = await upcoming(7)
    expect(result.overdue).toHaveLength(0)
    expect(result.overdueTotal).toEqual(tl('0.00'))
  })
})

/* ------------------------------------------------------------------ the plan */

describe('the plan and the rules', () => {
  it('warns about recurring money the plan does not account for', async () => {
    await internetBill({ startDate: '2026-10-05', categoryId: category.subscriptions })
    const plan = await readPlan()

    expect(plan.uncoveredRecurring).toHaveLength(1)
    expect(plan.uncoveredRecurring[0]?.name).toBe('Turkcell Superonline')
    expect(plan.uncoveredRecurring[0]?.amount).toEqual(tl('549.00'))
    expect(plan.uncoveredRecurring[0]?.occurrences).toBe(1)

    // Give the category a line and the warning goes: the money has a job now.
    await allocate(category.subscriptions, '700.00')
    expect((await readPlan()).uncoveredRecurring).toHaveLength(0)
  })

  it('counts a bill that falls twice in one month twice', async () => {
    await createRule({
      kind: 'expense',
      name: 'Cleaner',
      amount: tl('800.00'),
      freq: 'weekly',
      startDate: '2026-10-05',
      accountId: checking,
      categoryId: category.subscriptions,
    })
    const plan = await readPlan()
    // Four Mondays in October from the 5th: 5, 12, 19, 26.
    expect(plan.uncoveredRecurring[0]?.occurrences).toBe(4)
    expect(plan.uncoveredRecurring[0]?.amount).toEqual(tl('3200.00'))
  })

  it('leaves income rules out of the warning', async () => {
    await createRule({
      kind: 'income',
      name: 'Salary',
      amount: tl('46000.00'),
      freq: 'monthly',
      startDate: '2026-10-25',
      accountId: checking,
      categoryId: category.salary,
    })
    expect((await readPlan()).uncoveredRecurring).toHaveLength(0)
  })

  it('prefills a month from the rules, and never overwrites what is there', async () => {
    await internetBill({ startDate: '2026-10-05', categoryId: category.subscriptions })
    await createRule({
      kind: 'expense',
      name: 'Netflix',
      amount: tl('222.00'),
      freq: 'monthly',
      startDate: '2026-10-28',
      accountId: checking,
      categoryId: category.subscriptions,
    })
    await createRule({
      kind: 'expense',
      name: 'Rent',
      amount: tl('11500.00'),
      freq: 'monthly',
      startDate: '2026-10-01',
      accountId: checking,
      categoryId: category.rent,
    })
    await createRule({
      kind: 'income',
      name: 'Salary',
      amount: tl('46000.00'),
      freq: 'monthly',
      startDate: '2026-10-25',
      accountId: checking,
      categoryId: category.salary,
    })
    // An amount the user typed themselves, which the prefill must leave exactly as it is.
    await allocate(category.rent, '11000.00')

    const response = await actor.request({ method: 'POST', url: `/api/v1/plans/${START}/prefill` })
    expect(response.statusCode, response.body).toBe(200)
    const result = response.json<PrefillPlanResponse>()

    expect(result.createdLines).toBe(1)
    expect(result.skippedLines).toBe(1)
    expect(result.createdIncomeItems).toBe(1)

    const rows = result.plan.groups.flatMap((group) => group.rows)
    // Two subscriptions on one category become one line of 549 + 222.
    expect(rows.find((row) => row.categoryId === category.subscriptions)?.planned).toEqual(
      tl('771.00'),
    )
    // Untouched.
    expect(rows.find((row) => row.categoryId === category.rent)?.planned).toEqual(tl('11000.00'))

    expect(result.plan.incomeItems).toHaveLength(1)
    expect(result.plan.incomeItems[0]?.label).toBe('Salary')
    expect(result.plan.incomeItems[0]?.expected).toEqual(tl('46000.00'))
    expect(result.plan.incomeItems[0]?.expectedDate).toBe('2026-10-25')

    // Running it again fills in nothing, because everything now has a line.
    const again = await actor.request({ method: 'POST', url: `/api/v1/plans/${START}/prefill` })
    expect(again.json<PrefillPlanResponse>().createdLines).toBe(0)
    expect(again.json<PrefillPlanResponse>().createdIncomeItems).toBe(0)
  })

  it('treats a subcategory as covered by its parent’s line', async () => {
    const child = (
      await actor.request({
        method: 'POST',
        url: '/api/v1/categories',
        payload: {
          name: 'Streaming',
          groupId: groupOfCategory.subscriptions,
          parentId: category.subscriptions,
        },
      })
    ).json<{ id: string }>()

    await internetBill({ name: 'Netflix', startDate: '2026-10-28', categoryId: child.id })
    expect((await readPlan()).uncoveredRecurring).toHaveLength(1)

    // A subcategory with no line of its own is counted on its parent (§10), so planning the
    // parent covers it.
    await allocate(category.subscriptions, '700.00')
    expect((await readPlan()).uncoveredRecurring).toHaveLength(0)
  })

  it('prefills a goal line from a transfer rule', async () => {
    const goal = (
      await actor.request({
        method: 'POST',
        url: '/api/v1/goals',
        payload: {
          type: 'savings',
          name: 'Japan trip',
          target: tl('35000.00'),
          targetDate: '2027-07-15',
        },
      })
    ).json<{ id: string }>()

    await createRule({
      kind: 'transfer',
      name: 'Japan trip saving',
      amount: tl('2000.00'),
      freq: 'monthly',
      startDate: '2026-10-23',
      accountId: checking,
      toAccountId: savings,
      goalId: goal.id,
    })

    const result = (
      await actor.request({ method: 'POST', url: `/api/v1/plans/${START}/prefill` })
    ).json<PrefillPlanResponse>()
    expect(result.createdLines).toBe(1)

    const goalRow = result.plan.groups
      .flatMap((group) => group.rows)
      .find((row) => row.goalId === goal.id)
    expect(goalRow?.planned).toEqual(tl('2000.00'))
  })
})

/* ------------------------------------------------------------- the daily jobs */

describe('the auto-post job', () => {
  const clock = fixedClock(`${TODAY}T03:10:00+03:00`)

  it('posts only what opted in, and is safe to run twice', async () => {
    const auto = await internetBill({
      name: 'Spotify Premium',
      amount: tl('99.00'),
      startDate: '2026-10-20',
      autoPost: true,
    })
    await internetBill({ name: 'Manual bill', startDate: '2026-10-20' })

    const first = await runAutoPost(database.db, clock)
    expect(first.posted).toBe(1)

    // Idempotent: the unique index refuses the second attempt and the job reads that as done.
    const second = await runAutoPost(database.db, clock)
    expect(second.posted).toBe(0)

    const rows = await postedTransactions()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.total).toEqual(tl('-99.00'))

    const occurrence = (await occurrencesOf(auto.id, '?from=2026-10-01&to=2026-10-31'))
      .occurrences[0]
    expect(occurrence?.state).toBe('posted')
    expect(occurrence?.transactionId).toBe(rows[0]?.id)
  })

  it('catches up the last fortnight and no further back than that', async () => {
    // A weekly bill running since last year: only the occurrences inside the catch-up window
    // are posted, never the year of history behind them.
    await internetBill({ freq: 'weekly', startDate: '2025-10-23', autoPost: true })

    // The fortnight to 22 October holds three Thursdays, and nothing before the 8th.
    expect((await runAutoPost(database.db, clock)).posted).toBe(3)
    const dates = (await postedTransactions()).map((one) => one.date).sort()
    expect(dates).toEqual(['2026-10-08', '2026-10-15', '2026-10-22'])
  })

  it('leaves tomorrow alone', async () => {
    await internetBill({ startDate: '2026-10-23', autoPost: true })
    expect((await runAutoPost(database.db, clock)).posted).toBe(0)
  })

  it('leaves what was skipped alone', async () => {
    const rule = await internetBill({ startDate: '2026-10-20', autoPost: true })
    await actor.request({
      method: 'POST',
      url: `/api/v1/recurring/${rule.id}/occurrences/2026-10-20/skip`,
    })
    expect((await runAutoPost(database.db, clock)).posted).toBe(0)
  })

  it('waits rather than failing when an account it needs is archived', async () => {
    await internetBill({ startDate: '2026-10-20', autoPost: true })
    const archived = await actor.request({
      method: 'POST',
      url: `/api/v1/accounts/${checking}/archive`,
    })
    expect(archived.statusCode, archived.body).toBe(200)

    const result = await runAutoPost(database.db, clock)
    expect(result.posted).toBe(0)
    expect(result.blocked).toBe(1)
  })
})

describe('the sinking-fund roll-forward (decision D12)', () => {
  const clock = fixedClock(`${TODAY}T03:20:00+03:00`)

  it('moves a repeating fund’s date on once its bill has passed', async () => {
    const goal = (
      await actor.request({
        method: 'POST',
        url: '/api/v1/goals',
        payload: {
          type: 'sinking_fund',
          name: 'Kasko insurance',
          target: tl('6000.00'),
          targetDate: '2026-03-01',
          repeat: 'annual',
        },
      })
    ).json<{ id: string }>()

    expect((await rollRepeatingSinkingFunds(database.db, clock)).rolled).toBe(1)

    const after = (
      await actor.request({ method: 'GET', url: `/api/v1/goals/${goal.id}` })
    ).json<GoalResponse>()
    expect(after.goal.targetDate).toBe('2027-03-01')
    // Running it again changes nothing: the new date is ahead of today.
    expect((await rollRepeatingSinkingFunds(database.db, clock)).rolled).toBe(0)
  })

  it('leaves a fund that does not repeat where it is', async () => {
    await actor.request({
      method: 'POST',
      url: '/api/v1/goals',
      payload: {
        type: 'sinking_fund',
        name: 'One-off bill',
        target: tl('500.00'),
        targetDate: '2026-03-01',
      },
    })
    expect((await rollRepeatingSinkingFunds(database.db, clock)).rolled).toBe(0)
  })
})
