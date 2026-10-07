import { afterEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app.ts'
import { createAuth } from './auth/auth.ts'
import type { Database } from './db/client.ts'

function fakeDatabase(healthy: boolean): Database {
  return {
    db: {} as Database['db'],
    ping: async () => healthy,
    close: async () => {},
  }
}

const config = {
  nodeEnv: 'test',
  logLevel: 'silent',
  webOrigin: 'http://localhost:5173',
  trustProxy: false,
  authSecret: 'test-secret-at-least-thirty-two-characters',
  breachedPasswordCheck: false,
} as const

const silentMailer = { sendPasswordReset: async () => {} }

/**
 * The cross-cutting behaviour here never reaches the database, so a fake one is enough. Auth is
 * still wired in, because the session guard and the origin check are part of what is tested.
 */
function buildTestApp(database: Database) {
  return buildApp({
    config,
    database,
    auth: createAuth({ config, database, mailer: silentMailer }),
  })
}

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('GET /api/v1/health', () => {
  it('returns 200 when the database answers', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok', checks: { database: 'ok' } })
  })

  it('returns 503 when the database is unreachable', async () => {
    app = await buildTestApp(fakeDatabase(false))
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'error', checks: { database: 'error' } })
  })
})

describe('cross-cutting behavior', () => {
  it('answers unknown routes with problem+json', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(response.json()).toMatchObject({ type: 'about:blank', title: 'Not Found', status: 404 })
  })

  it('assigns its own request id and ignores the client one', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-request-id': 'attacker-controlled' },
    })
    const requestId = response.headers['x-request-id']
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('sets security and no-store headers', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-security-policy']).toContain("default-src 'none'")
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('allows CORS only for the configured web origin', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'http://localhost:5173' },
    })
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')

    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://evil.example' },
    })
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('blocks state-changing requests from another site', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' },
      payload: { name: 'Mallory' },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ status: 403, detail: 'Cross-site request blocked.' })
  })

  it('blocks a state-changing request whose Origin is not the web app', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { origin: 'https://evil.example' },
      payload: { name: 'Mallory' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('lets same-origin state-changing requests through to the session guard', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173' },
      payload: { name: 'Nadia' },
    })
    expect(response.statusCode).toBe(401)
  })

  it('requires a session on the protected endpoints', async () => {
    app = await buildTestApp(fakeDatabase(true))
    for (const url of ['/api/v1/me', '/api/v1/workspace/settings']) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(401)
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/)
    }
  })

  it('accepts a JSON content type with an empty body, for the action endpoints', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts/019a2c1e-0000-7000-8000-000000000001/archive',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      payload: '',
    })
    // Past the parser and refused by the session guard, which is the point.
    expect(response.statusCode).toBe(401)
  })

  it('refuses a malformed JSON body without echoing it', async () => {
    app = await buildTestApp(fakeDatabase(true))
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      payload: '{"name": "Secret account", ',
    })
    expect(response.statusCode).toBe(400)
    expect(response.body).not.toContain('Secret account')
  })

  it('hides internal error details from clients', async () => {
    app = await buildTestApp(fakeDatabase(true))
    app.get('/boom', async () => {
      throw new Error('connection string postgres://secret@db')
    })
    const response = await app.inject({ method: 'GET', url: '/boom' })
    expect(response.statusCode).toBe(500)
    expect(response.body).not.toContain('secret')
    expect(response.json()).toMatchObject({ status: 500, title: 'Internal Server Error' })
  })
})
