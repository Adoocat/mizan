import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDatabase, type Database } from './client.ts'

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))

export async function runMigrations(database: Database): Promise<void> {
  await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER })
}

// Run directly: `pnpm db:migrate`
if (import.meta.main) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const database = createDatabase(url)
  try {
    await runMigrations(database)
    console.log('Migrations applied')
  } finally {
    await database.close()
  }
}
