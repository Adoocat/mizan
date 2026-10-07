import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../db/client.ts'
import type { App } from '../../app.ts'
import { currencies } from '../../db/schema/index.ts'
import { buildTestApp } from '../../testing/app.ts'
import { connectTestDatabase } from '../../testing/postgres.ts'

let database: Database
let app: App

beforeAll(async () => {
  database = connectTestDatabase()
  app = (await buildTestApp(database)).app
})

afterAll(async () => {
  await app?.close()
  await database?.close()
})

describe('health against a real Postgres', () => {
  it('reports the database as healthy', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok', checks: { database: 'ok' } })
  })
})

describe('initial migration', () => {
  it('seeds the supported currencies', async () => {
    const rows = await database.db.select().from(currencies).orderBy(currencies.code)
    expect(rows).toEqual([
      { code: 'EUR', minorUnits: 2, symbol: '€' },
      { code: 'GBP', minorUnits: 2, symbol: '£' },
      { code: 'TRY', minorUnits: 2, symbol: '₺' },
      { code: 'USD', minorUnits: 2, symbol: '$' },
    ])
  })

  it('rejects malformed currency codes', async () => {
    await expect(
      database.db.execute(
        sql`insert into currencies (code, minor_units, symbol) values ('try', 2, 'x')`,
      ),
    ).rejects.toThrow()
  })

  it('is idempotent when applied twice', async () => {
    const { runMigrations } = await import('../../db/migrate.ts')
    await expect(runMigrations(database)).resolves.toBeUndefined()
  })
})
