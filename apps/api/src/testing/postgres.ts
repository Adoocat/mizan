import { inject } from 'vitest'
import { createDatabase, type Database } from '../db/client.ts'

export { POSTGRES_IMAGE } from './global-setup.ts'

/**
 * A connection pool onto the integration database that `global-setup.ts` started and migrated.
 * Each test file opens its own pool and closes it in `afterAll`.
 */
export function connectTestDatabase(): Database {
  return createDatabase(inject('databaseUrl'))
}
