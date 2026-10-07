import { createUuidv7 } from '@mizan/domain'

/**
 * The browser's UUIDv7 generator, used to give a create its id before it is sent. A retry — a
 * double tap, or a resend after a dropped response — carries the same id, and the API answers with
 * the resource that already exists instead of making a second one (PLAN §12).
 */
export const uuidv7 = createUuidv7({
  now: () => Date.now(),
  randomBytes: (count) => globalThis.crypto.getRandomValues(new Uint8Array(count)),
})
