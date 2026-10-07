import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  createUuidv7,
  InvalidUuidSeedError,
  isUuid,
  UUIDV7_RANDOM_BYTES,
  type Uuidv7Sources,
} from './uuid.ts'

const V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Deterministic sources: a clock the test advances and a counting byte source. */
function sources(startMs: number): Uuidv7Sources & { set(ms: number): void } {
  let nowMs = startMs
  let seed = 0
  return {
    now: () => nowMs,
    randomBytes: (count) =>
      Uint8Array.from({ length: count }, () => {
        seed = (seed + 37) % 256
        return seed
      }),
    set(ms) {
      nowMs = ms
    },
  }
}

const timestampOf = (id: string) => Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)

describe('createUuidv7', () => {
  it('produces a version 7, variant 1 UUID', () => {
    const uuidv7 = createUuidv7(sources(Date.UTC(2026, 9, 7)))
    expect(uuidv7()).toMatch(V7_PATTERN)
  })

  it('encodes the millisecond timestamp in the first 48 bits', () => {
    const now = Date.UTC(2026, 9, 7, 12, 30, 0)
    const uuidv7 = createUuidv7(sources(now))
    expect(timestampOf(uuidv7())).toBe(now)
  })

  it('handles a timestamp beyond 32 bits', () => {
    // 2255-06-05: well past the point where a 32-bit shift would overflow.
    const now = 9_000_000_000_000
    const uuidv7 = createUuidv7(sources(now))
    expect(timestampOf(uuidv7())).toBe(now)
  })

  it('sorts lexicographically by time', () => {
    const clock = sources(Date.UTC(2026, 0, 1))
    const uuidv7 = createUuidv7(clock)
    const early = uuidv7()
    clock.set(Date.UTC(2026, 11, 31))
    expect(early < uuidv7()).toBe(true)
  })

  it('keeps ids minted in the same millisecond in order', () => {
    const uuidv7 = createUuidv7(sources(1_760_000_000_000))
    const ids = Array.from({ length: 300 }, () => uuidv7())
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('restarts the counter when the millisecond changes', () => {
    const clock = sources(1_760_000_000_000)
    const uuidv7 = createUuidv7(clock)
    const before = uuidv7()
    clock.set(1_760_000_000_001)
    const after = uuidv7()
    expect(before < after).toBe(true)
  })

  it('refuses a clock that is not a whole millisecond', () => {
    for (const now of [-1, 1.5, Number.NaN, Number.MAX_VALUE]) {
      const uuidv7 = createUuidv7({ now: () => now, randomBytes: (n) => new Uint8Array(n) })
      expect(() => uuidv7(), String(now)).toThrow(InvalidUuidSeedError)
    }
  })

  it('refuses a random source that returns the wrong number of bytes', () => {
    const uuidv7 = createUuidv7({ now: () => 1, randomBytes: () => new Uint8Array(3) })
    expect(() => uuidv7()).toThrow(InvalidUuidSeedError)
  })
})

describe('isUuid', () => {
  it('accepts a generated id and rejects anything else', () => {
    const uuidv7 = createUuidv7(sources(Date.UTC(2026, 9, 7)))
    expect(isUuid(uuidv7())).toBe(true)
    expect(isUuid('019a2c1e-0000-4000-8000-000000000001')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('019a2c1e-0000-7000-0000-000000000001')).toBe(false)
    expect(isUuid(42)).toBe(false)
  })
})

describe('properties', () => {
  it('is always well formed, for any instant and any randomness', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 281_474_976_710_655 }),
        fc.uint8Array({ minLength: UUIDV7_RANDOM_BYTES, maxLength: UUIDV7_RANDOM_BYTES }),
        (now, random) => {
          const uuidv7 = createUuidv7({ now: () => now, randomBytes: () => random })
          const id = uuidv7()
          expect(id).toMatch(V7_PATTERN)
          expect(timestampOf(id)).toBe(now)
        },
      ),
    )
  })

  it('never repeats an id, however fast it is called', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 60 }), (steps) => {
        const clock = sources(1_760_000_000_000)
        const uuidv7 = createUuidv7(clock)
        let nowMs = 1_760_000_000_000
        const ids = steps.map((step) => {
          nowMs += step
          clock.set(nowMs)
          return uuidv7()
        })
        expect(new Set(ids).size).toBe(ids.length)
      }),
    )
  })
})
