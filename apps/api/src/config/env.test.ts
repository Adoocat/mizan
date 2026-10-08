import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './env.ts'

const DATABASE_URL = 'postgres://user:s3cret-value@localhost:5432/mizan'
const AUTH_SECRET = 'at-least-thirty-two-characters-long-secret'
/** The two values every config needs; tests add or override from here. */
const required = { DATABASE_URL, AUTH_SECRET }

describe('loadConfig', () => {
  it('applies defaults for optional values', () => {
    expect(loadConfig(required)).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      databaseUrl: DATABASE_URL,
      databasePoolMax: 10,
      webOrigin: 'http://localhost:5173',
      trustProxy: false,
      authSecret: AUTH_SECRET,
      breachedPasswordCheck: true,
    })
  })

  it('parses explicit values', () => {
    const config = loadConfig({
      ...required,
      PORT: '8080',
      TRUST_PROXY: 'true',
      WEB_ORIGIN: 'https://app.example.com/',
      NODE_ENV: 'production',
      DATABASE_POOL_MAX: '40',
    })
    expect(config.port).toBe(8080)
    expect(config.trustProxy).toBe(true)
    expect(config.webOrigin).toBe('https://app.example.com')
    expect(config.databasePoolMax).toBe(40)
  })

  it('refuses a pool size that is not a usable number of connections', () => {
    for (const value of ['0', '-1', 'ten', '1000']) {
      expect(() => loadConfig({ ...required, DATABASE_POOL_MAX: value }), value).toThrow(
        /DATABASE_POOL_MAX/,
      )
    }
  })

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({ AUTH_SECRET })).toThrow(/DATABASE_URL/)
  })

  it('requires an auth secret long enough to sign cookies', () => {
    expect(() => loadConfig({ DATABASE_URL })).toThrow(/AUTH_SECRET/)
    expect(() => loadConfig({ DATABASE_URL, AUTH_SECRET: 'too-short' })).toThrow(
      /AUTH_SECRET: must be at least 32 characters/,
    )
  })

  it('can switch off the breached-password check for an offline environment', () => {
    expect(
      loadConfig({ ...required, AUTH_BREACHED_PASSWORD_CHECK: 'false' }).breachedPasswordCheck,
    ).toBe(false)
  })

  it('rejects a non-Postgres database URL', () => {
    expect(() => loadConfig({ ...required, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      ConfigError,
    )
  })

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...required, PORT: '70000' })).toThrow(/PORT/)
  })

  it('requires https for the web origin in production', () => {
    expect(() =>
      loadConfig({ ...required, NODE_ENV: 'production', WEB_ORIGIN: 'http://app.example.com' }),
    ).toThrow(/https/)
  })

  it('never echoes secret values in error messages', () => {
    try {
      loadConfig({ ...required, DATABASE_URL: 'not a url s3cret-value', PORT: 'abc' })
      expect.unreachable()
    } catch (error) {
      expect(String(error)).not.toContain('s3cret-value')
    }
  })
})
