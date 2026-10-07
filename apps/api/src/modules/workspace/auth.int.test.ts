import type { MeResponse } from '@mizan/contracts'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import { sessions, workspaceMembers, workspaces } from '../../db/schema/index.ts'
import { buildTestApp, type TestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import {
  browserHeaders,
  cookiesFrom,
  signUpActor,
  TEST_PASSWORD,
  type Actor,
} from '../../testing/session.ts'

let database: Database
let harness: TestApp

beforeAll(async () => {
  database = connectTestDatabase()
  harness = await buildTestApp(database)
})

afterAll(async () => {
  await harness?.close()
  await database?.close()
})

const signUp = (payload: object) =>
  harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-up/email',
    headers: browserHeaders(),
    payload,
  })

const signIn = (payload: object) =>
  harness.app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in/email',
    headers: browserHeaders(),
    payload,
  })

describe('sign up', () => {
  it('creates the user, a personal workspace and an owner membership', async () => {
    const actor = await signUpActor(harness.app)

    const [workspace] = await database.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, actor.workspaceId))
    expect(workspace).toMatchObject({
      name: 'Personal',
      baseCurrency: 'TRY',
      periodStartDay: 1,
      timezone: 'Europe/Istanbul',
    })

    const members = await database.db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, actor.workspaceId))
    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({ userId: actor.userId, role: 'owner' })
  })

  it('signs the new user in, so the session cookie comes back httpOnly', async () => {
    const response = await signUp({
      name: 'Elif',
      email: `fresh-${Date.now()}@example.test`,
      password: TEST_PASSWORD,
    })
    expect(response.statusCode).toBe(200)
    const cookie = String(response.headers['set-cookie'])
    expect(cookie).toContain('mizan.session_token')
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })

  it('rejects a second sign-up with the same email', async () => {
    const email = `dup-${Date.now()}@example.test`
    await signUp({ name: 'First', email, password: TEST_PASSWORD })
    const second = await signUp({ name: 'Second', email, password: TEST_PASSWORD })
    expect(second.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('rejects a password shorter than the minimum', async () => {
    const response = await signUp({
      name: 'Short',
      email: `short-${Date.now()}@example.test`,
      password: 'short1234',
    })
    expect(response.statusCode).toBe(400)
  })

  it('stores the email lowercased, so sign-in is case-insensitive', async () => {
    const stamp = Date.now()
    const signUpResponse = await signUp({
      name: 'Mixed',
      email: `MiXeD-${stamp}@Example.Test`,
      password: TEST_PASSWORD,
    })
    expect(signUpResponse.statusCode).toBe(200)

    const response = await signIn({ email: `mixed-${stamp}@example.test`, password: TEST_PASSWORD })
    expect(response.statusCode).toBe(200)
  })
})

describe('sign in and sign out', () => {
  let actor: Actor

  beforeAll(async () => {
    actor = await signUpActor(harness.app)
  })

  it('accepts the right password', async () => {
    const response = await signIn({ email: actor.email, password: actor.password })
    expect(response.statusCode).toBe(200)
    expect(cookiesFrom(response)).toContain('mizan.session_token')
  })

  it('rejects the wrong password without saying which part was wrong', async () => {
    const response = await signIn({ email: actor.email, password: 'definitely-not-the-password' })
    expect(response.statusCode).toBe(401)
    expect(response.body.toLowerCase()).not.toContain('password is')
  })

  it('answers the same way for an unknown email as for a wrong password', async () => {
    const unknown = await signIn({
      email: `nobody-${Date.now()}@example.test`,
      password: TEST_PASSWORD,
    })
    const wrong = await signIn({ email: actor.email, password: 'definitely-not-the-password' })
    expect(unknown.statusCode).toBe(wrong.statusCode)
  })

  it('ends the session on sign-out, and the cookie stops working', async () => {
    const fresh = await signUpActor(harness.app)
    const signOut = await fresh.request({
      method: 'POST',
      url: '/api/v1/auth/sign-out',
      payload: {},
    })
    expect(signOut.statusCode, signOut.body).toBe(200)

    const after = await fresh.request({ method: 'GET', url: '/api/v1/me' })
    expect(after.statusCode).toBe(401)
  })
})

describe('sessions', () => {
  it('rejects an unknown session token', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: browserHeaders('mizan.session_token=made-up-token'),
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects an expired session and removes the row', async () => {
    const actor = await signUpActor(harness.app)
    await database.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(sessions.userId, actor.userId))

    const response = await actor.request({ method: 'GET', url: '/api/v1/me' })
    expect(response.statusCode).toBe(401)
  })

  it('rejects a session past the absolute lifetime even if it was just used', async () => {
    const actor = await signUpActor(harness.app)
    const longAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    await database.db
      .update(sessions)
      .set({ createdAt: longAgo })
      .where(eq(sessions.userId, actor.userId))

    const response = await actor.request({ method: 'GET', url: '/api/v1/me' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({ detail: 'Your session expired. Sign in again.' })

    const remaining = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, actor.userId))
    expect(remaining).toHaveLength(0)
  })
})

describe('password reset', () => {
  it('mails a single-use link that sets a new password and revokes other sessions', async () => {
    const actor = await signUpActor(harness.app)
    const newPassword = 'a-brand-new-long-password'

    const forget = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-password-reset',
      headers: browserHeaders(),
      payload: { email: actor.email, redirectTo: '/reset-password' },
    })
    expect(forget.statusCode).toBe(200)

    const token = harness.mailer.lastResetToken()
    expect(token).toBeTruthy()

    const reset = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      headers: browserHeaders(),
      payload: { token, newPassword },
    })
    expect(reset.statusCode).toBe(200)

    // The old session is gone and the old password no longer works.
    expect((await actor.request({ method: 'GET', url: '/api/v1/me' })).statusCode).toBe(401)
    expect((await signIn({ email: actor.email, password: actor.password })).statusCode).toBe(401)
    expect((await signIn({ email: actor.email, password: newPassword })).statusCode).toBe(200)

    // The token is single-use.
    const replay = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      headers: browserHeaders(),
      payload: { token, newPassword: 'yet-another-long-password' },
    })
    expect(replay.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('does not reveal whether an email has an account', async () => {
    const before = harness.mailer.sent.length
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-password-reset',
      headers: browserHeaders(),
      payload: { email: `ghost-${Date.now()}@example.test`, redirectTo: '/reset-password' },
    })
    expect(response.statusCode).toBe(200)
    expect(harness.mailer.sent).toHaveLength(before)
  })
})

describe('rate limiting', () => {
  it('locks out repeated failures against one account and lets a success through again', async () => {
    const actor = await signUpActor(harness.app)

    let limited = 0
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await signIn({ email: actor.email, password: `wrong-${attempt}-password` })
      if (response.statusCode === 429) limited += 1
    }
    expect(limited).toBeGreaterThan(0)

    const lockedOut = await signIn({ email: actor.email, password: actor.password })
    expect(lockedOut.statusCode).toBe(429)
    expect(lockedOut.headers['retry-after']).toBeDefined()

    // Another account is unaffected: the budget is per account, not global.
    const other = await signUpActor(harness.app)
    expect((await signIn({ email: other.email, password: other.password })).statusCode).toBe(200)
  })
})

describe('GET /api/v1/me', () => {
  it('returns the user and their workspace', async () => {
    const actor = await signUpActor(harness.app, { name: 'Elif Demir' })
    const response = await actor.request({ method: 'GET', url: '/api/v1/me' })
    expect(response.statusCode).toBe(200)
    expect(response.json<MeResponse>()).toEqual({
      user: {
        id: actor.userId,
        name: 'Elif Demir',
        email: actor.email,
        emailVerified: false,
        locale: 'en',
        timezone: 'Europe/Istanbul',
      },
      workspace: {
        id: actor.workspaceId,
        name: 'Personal',
        baseCurrency: 'TRY',
        periodStartDay: 1,
        timezone: 'Europe/Istanbul',
        role: 'owner',
      },
    })
  })
})
