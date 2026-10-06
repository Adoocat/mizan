import { afterEach, describe, expect, it } from 'vitest'
import { buildApp, type App } from './app.ts'
import type { Database } from './db/client.ts'

function fakeDatabase(healthy: boolean): Database {
  return {
    db: {} as Database['db'],
    ping: async () => healthy,
    close: async () => {},
  }
}

const config = {
  logLevel: 'silent',
  webOrigin: 'http://localhost:5173',
  trustProxy: false,
} as const

let app: App | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('GET /api/v1/health', () => {
  it('returns 200 when the database answers', async () => {
    app = await buildApp({ config, database: fakeDatabase(true) })
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok', checks: { database: 'ok' } })
  })

  it('returns 503 when the database is unreachable', async () => {
    app = await buildApp({ config, database: fakeDatabase(false) })
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'error', checks: { database: 'error' } })
  })
})

describe('cross-cutting behavior', () => {
  it('answers unknown routes with problem+json', async () => {
    app = await buildApp({ config, database: fakeDatabase(true) })
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' })
    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/)
    expect(response.json()).toMatchObject({ type: 'about:blank', title: 'Not Found', status: 404 })
  })

  it('assigns its own request id and ignores the client one', async () => {
    app = await buildApp({ config, database: fakeDatabase(true) })
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-request-id': 'attacker-controlled' },
    })
    const requestId = response.headers['x-request-id']
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('sets security and no-store headers', async () => {
    app = await buildApp({ config, database: fakeDatabase(true) })
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-security-policy']).toContain("default-src 'none'")
    expect(response.headers['x-powered-by']).toBeUndefined()
  })

  it('allows CORS only for the configured web origin', async () => {
    app = await buildApp({ config, database: fakeDatabase(true) })
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

  it('hides internal error details from clients', async () => {
    app = await buildApp({ config, database: fakeDatabase(true) })
    app.get('/boom', async () => {
      throw new Error('connection string postgres://secret@db')
    })
    const response = await app.inject({ method: 'GET', url: '/boom' })
    expect(response.statusCode).toBe(500)
    expect(response.body).not.toContain('secret')
    expect(response.json()).toMatchObject({ status: 500, title: 'Internal Server Error' })
  })
})
