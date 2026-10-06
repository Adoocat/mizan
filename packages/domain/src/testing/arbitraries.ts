import fc from 'fast-check'
import { fromEpochDays, toEpochDays, type PlainDate } from '../dates.ts'
import { Money } from '../money.ts'

/** Shared fast-check generators for domain property tests. */

/** Minor units up to ±₺100 billion. */
export const arbMinor = fc.bigInt({ min: -10_000_000_000_000n, max: 10_000_000_000_000n })

export const arbTry = arbMinor.map((minor) => Money.fromMinor(minor, 'TRY'))

export const arbNonNegativeTry = fc
  .bigInt({ min: 0n, max: 10_000_000_000_000n })
  .map((minor) => Money.fromMinor(minor, 'TRY'))

const MIN_DAY = toEpochDays('1900-01-01' as PlainDate)
const MAX_DAY = toEpochDays('2200-12-31' as PlainDate)

export const arbPlainDate = fc
  .integer({ min: MIN_DAY, max: MAX_DAY })
  .map((days) => fromEpochDays(days))

export const arbStartDay = fc.integer({ min: 1, max: 28 })
