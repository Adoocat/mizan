import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './env.ts'

const DATABASE_URL = 'postgres://user:s3cret-value@localhost:5432/mizan'

describe('loadConfig', () => {
  it('applies defaults for optional values', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      databaseUrl: DATABASE_URL,
      webOrigin: 'http://localhost:5173',
      trustProxy: false,
    })
  })

  it('parses explicit values', () => {
    const config = loadConfig({
      DATABASE_URL,
      PORT: '8080',
      TRUST_PROXY: 'true',
      WEB_ORIGIN: 'https://app.example.com/',
      NODE_ENV: 'production',
    })
    expect(config.port).toBe(8080)
    expect(config.trustProxy).toBe(true)
    expect(config.webOrigin).toBe('https://app.example.com')
  })

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  })

  it('rejects a non-Postgres database URL', () => {
    expect(() => loadConfig({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(ConfigError)
  })

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ DATABASE_URL, PORT: '70000' })).toThrow(/PORT/)
  })

  it('requires https for the web origin in production', () => {
    expect(() =>
      loadConfig({ DATABASE_URL, NODE_ENV: 'production', WEB_ORIGIN: 'http://app.example.com' }),
    ).toThrow(/https/)
  })

  it('never echoes secret values in error messages', () => {
    try {
      loadConfig({ DATABASE_URL: 'not a url s3cret-value', PORT: 'abc' })
      expect.unreachable()
    } catch (error) {
      expect(String(error)).not.toContain('s3cret-value')
    }
  })
})
