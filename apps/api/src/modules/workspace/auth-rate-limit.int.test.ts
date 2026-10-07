import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import { buildTestApp, type TestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import { browserHeaders, TEST_PASSWORD } from '../../testing/session.ts'

/**
 * The per-IP limits are off in the rest of the suite, which drives dozens of sign-ups from one
 * address. This file builds its own app with them on, so the rules in `createAuth` are covered.
 */
let database: Database
let harness: TestApp

beforeAll(async () => {
  database = connectTestDatabase()
  harness = await buildTestApp(database, { ipRateLimit: true })
})

afterAll(async () => {
  await harness?.close()
  await database?.close()
})

const post = (url: string, payload: object) =>
  harness.app.inject({ method: 'POST', url, headers: browserHeaders(), payload })

describe('per-IP auth rate limits', () => {
  it('throttles a burst of sign-in attempts from one address', async () => {
    const statuses: number[] = []
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const response = await post('/api/v1/auth/sign-in/email', {
        email: `burst-${attempt}@example.test`,
        password: TEST_PASSWORD,
      })
      statuses.push(response.statusCode)
    }
    expect(statuses).toContain(429)
  })

  it('leaves unauthenticated reads alone', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.statusCode).toBe(200)
  })
})
