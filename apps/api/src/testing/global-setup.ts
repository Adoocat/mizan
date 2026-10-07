import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'
import { createDatabase } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'

export const POSTGRES_IMAGE = 'postgres:18-alpine'

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string
  }
}

/**
 * One throwaway Postgres for the whole integration run, migrated once.
 *
 * Test files share it rather than each paying for a container start. They never collide: every
 * test creates its own user and workspace, and workspace scoping is exactly what is under test.
 */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
  const databaseUrl = container.getConnectionUri()

  const database = createDatabase(databaseUrl)
  try {
    await runMigrations(database)
  } finally {
    await database.close()
  }

  project.provide('databaseUrl', databaseUrl)

  return async () => {
    await container.stop()
  }
}
