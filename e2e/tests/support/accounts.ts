import { randomUUID } from 'node:crypto'

export const TEST_PASSWORD = 'correct-horse-battery-staple'

/** A fresh address per run, so a re-run never collides with a user left behind by the last one. */
export function newEmail(prefix = 'e2e'): string {
  return `${prefix}-${randomUUID()}@example.test`
}

/** Where the signed-in storage state lives, written by `auth.setup.ts`. */
export const STORAGE_STATE = 'playwright/.auth/user.json'
