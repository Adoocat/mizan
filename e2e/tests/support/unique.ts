import { randomUUID } from 'node:crypto'

/**
 * A short random suffix, so a test can name things only it will find.
 *
 * The specs share one signed-in workspace and both browser projects run against it at the same
 * time, so a test that matched on "Japan trip" would find whichever run created one first. Every
 * name a spec creates carries one of these.
 *
 * `randomUUID` rather than `Math.random`, for two reasons: the first eight hex characters of a
 * v4 UUID collide far less often than six base-36 characters from a generator two parallel
 * processes may seed alike, and CodeQL flags `Math.random` wherever it appears without being able
 * to tell a test fixture from a token. `support/accounts.ts` already generates its addresses this
 * way.
 */
export const unique = (): string => randomUUID().slice(0, 8)
