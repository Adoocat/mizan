import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { createDatabase, type Database } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'

export const POSTGRES_IMAGE = 'postgres:18-alpine'

export interface TestPostgres {
  container: StartedPostgreSqlContainer
  database: Database
  stop(): Promise<void>
}

/** Starts a throwaway Postgres in Docker with all migrations applied. */
export async function startTestPostgres(): Promise<TestPostgres> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
  const database = createDatabase(container.getConnectionUri())
  await runMigrations(database)
  return {
    container,
    database,
    async stop() {
      await database.close()
      await container.stop()
    },
  }
}
