import { randomBytes } from 'node:crypto'
import { createUuidv7 } from '@mizan/domain'

/**
 * The API's UUIDv7 generator. The algorithm lives in the domain, which takes its clock and its
 * randomness by injection; this is where Node's supply them.
 */
export const uuidv7 = createUuidv7({
  now: () => Date.now(),
  randomBytes: (count) => randomBytes(count),
})
