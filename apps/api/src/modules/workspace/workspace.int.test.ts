import type { MeResponse } from '@mizan/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import { buildTestApp, type TestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'
import { signUpActor, type Actor } from '../../testing/session.ts'

let database: Database
let harness: TestApp
let actor: Actor

beforeAll(async () => {
  database = connectTestDatabase()
  harness = await buildTestApp(database)
  actor = await signUpActor(harness.app, { name: 'Elif' })
})

afterAll(async () => {
  await harness?.close()
  await database?.close()
})

describe('PATCH /api/v1/me', () => {
  it('changes the display name and the UI language', async () => {
    const response = await actor.request({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { name: 'Elif Demir', locale: 'tr' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json<MeResponse>().user).toMatchObject({ name: 'Elif Demir', locale: 'tr' })

    const reread = await actor.request({ method: 'GET', url: '/api/v1/me' })
    expect(reread.json<MeResponse>().user).toMatchObject({ name: 'Elif Demir', locale: 'tr' })
  })

  it('rejects an unsupported language', async () => {
    const response = await actor.request({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { locale: 'de' },
    })
    expect(response.statusCode).toBe(400)
  })

  it('rejects an empty patch', async () => {
    const response = await actor.request({ method: 'PATCH', url: '/api/v1/me', payload: {} })
    expect(response.statusCode).toBe(400)
  })

  it('ignores fields the client may not set', async () => {
    const response = await actor.request({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { name: 'Elif Demir', email: 'someone-else@example.test', emailVerified: true },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json<MeResponse>().user).toMatchObject({
      email: actor.email,
      emailVerified: false,
    })
  })
})

describe('PATCH /api/v1/workspace/settings', () => {
  it('changes the plan anchor and the workspace name', async () => {
    const response = await actor.request({
      method: 'PATCH',
      url: '/api/v1/workspace/settings',
      payload: { name: 'Household', periodStartDay: 15 },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json<MeResponse>().workspace).toMatchObject({
      name: 'Household',
      periodStartDay: 15,
      role: 'owner',
    })

    const reread = await actor.request({ method: 'GET', url: '/api/v1/workspace/settings' })
    expect(reread.json<MeResponse>().workspace).toMatchObject({ periodStartDay: 15 })
  })

  it('rejects a start day the calendar cannot honour every month', async () => {
    for (const periodStartDay of [0, 29, 31, 1.5]) {
      const response = await actor.request({
        method: 'PATCH',
        url: '/api/v1/workspace/settings',
        payload: { periodStartDay },
      })
      expect(response.statusCode, `start day ${periodStartDay}`).toBe(400)
    }
  })

  it('rejects an unknown currency and a blank name', async () => {
    const currency = await actor.request({
      method: 'PATCH',
      url: '/api/v1/workspace/settings',
      payload: { baseCurrency: 'XYZ' },
    })
    expect(currency.statusCode).toBe(400)

    const blank = await actor.request({
      method: 'PATCH',
      url: '/api/v1/workspace/settings',
      payload: { name: '   ' },
    })
    expect(blank.statusCode).toBe(400)
  })
})
