/**
 * UUIDv7 (RFC 9562): a 48-bit Unix millisecond timestamp followed by random bits.
 *
 * Ids sort by creation time, which keeps B-tree inserts at the right edge of the index and makes
 * the `(workspace_id, date DESC, id DESC)` cursor pagination in PLAN §7 cheap. Clients generate
 * them too, which is what makes creates idempotent (§12) — so the generator lives here, where
 * both the API and the web app can use the same one.
 *
 * The time and the randomness are injected rather than read from globals, which is what keeps the
 * domain free of `Date.now()` and `Math.random()`.
 */

const COUNTER_MASK = 0x0fff
/** Seeded in the lower half of its range so a burst inside one millisecond cannot wrap it. */
const COUNTER_SEED_MASK = 0x07ff

/** Bytes a single id needs: 2 to seed the counter, 8 for `rand_b`. */
export const UUIDV7_RANDOM_BYTES = 10

export class InvalidUuidSeedError extends Error {
  override name = 'InvalidUuidSeedError'
}

export interface Uuidv7Sources {
  /** Milliseconds since the Unix epoch. */
  now(): number
  /** Exactly `UUIDV7_RANDOM_BYTES` cryptographically random bytes. */
  randomBytes(count: number): Uint8Array
}

const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'))

function format(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += HEX[byte]!
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Builds a generator. It is deliberately stateful: it remembers the last millisecond so ids minted
 * inside one millisecond keep their order through the 12-bit `rand_a` field, used as a counter.
 */
export function createUuidv7(sources: Uuidv7Sources): () => string {
  let lastMs = -1
  let counter = 0

  return function uuidv7(): string {
    const nowMs = sources.now()
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new InvalidUuidSeedError('now() must return a non-negative integer millisecond')
    }

    const random = sources.randomBytes(UUIDV7_RANDOM_BYTES)
    if (random.length !== UUIDV7_RANDOM_BYTES) {
      throw new InvalidUuidSeedError(`randomBytes must return ${UUIDV7_RANDOM_BYTES} bytes`)
    }

    if (nowMs === lastMs) {
      counter = (counter + 1) & COUNTER_MASK
    } else {
      lastMs = nowMs
      counter = ((random[0]! << 8) | random[1]!) & COUNTER_SEED_MASK
    }

    const bytes = new Uint8Array(16)
    // 48-bit big-endian timestamp. Shifting past 32 bits is unsafe, so the high and low halves
    // are written separately.
    const high = Math.floor(nowMs / 0x1_0000_0000)
    const low = nowMs % 0x1_0000_0000
    bytes[0] = (high >>> 8) & 0xff
    bytes[1] = high & 0xff
    bytes[2] = (low >>> 24) & 0xff
    bytes[3] = (low >>> 16) & 0xff
    bytes[4] = (low >>> 8) & 0xff
    bytes[5] = low & 0xff
    // Version 7 in the high nibble of byte 6, then the 12 counter bits.
    bytes[6] = 0x70 | ((counter >> 8) & 0x0f)
    bytes[7] = counter & 0xff
    // RFC 9562 variant 10xx in the two high bits of byte 8; the rest is random.
    bytes[8] = 0x80 | (random[2]! & 0x3f)
    for (let index = 0; index < 7; index += 1) bytes[9 + index] = random[3 + index]!

    return format(bytes)
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** A syntactically valid RFC 9562 UUID of any version. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.toLowerCase())
}
