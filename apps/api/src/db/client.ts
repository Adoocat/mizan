import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.ts'

export type Db = NodePgDatabase<typeof schema>

export interface Database {
  db: Db
  /** Returns true when the database answers a trivial query. Never throws. */
  ping(): Promise<boolean>
  close(): Promise<void>
}

export interface DatabaseOptions {
  /** Connections the pool may open. See `DATABASE_POOL_MAX`. */
  max?: number
}

export function createDatabase(
  connectionString: string,
  { max = 10 }: DatabaseOptions = {},
): Database {
  const pool = new pg.Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Keep any single statement from holding a connection forever.
    statement_timeout: 15_000,
  })
  // An idle client error must not crash the process; the next query surfaces it.
  pool.on('error', () => {})

  const db = drizzle({ client: pool, schema, casing: 'snake_case' })

  return {
    db,
    async ping() {
      try {
        await db.execute(sql`select 1`)
        return true
      } catch {
        return false
      }
    },
    async close() {
      await pool.end()
    },
  }
}
