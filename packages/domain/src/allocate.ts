import { Decimal, decimal, type DecimalInput } from './decimal.ts'
import { Money } from './money.ts'

export class AllocationError extends Error {
  override name = 'AllocationError'
}

/**
 * Splits `total` into parts proportional to `weights` with the largest-remainder method,
 * so the parts always sum exactly to the total.
 *
 * - Works in the currency's minor units. The total must already be whole minor units.
 * - Each part gets the floor of its exact share. Leftover minor units go one at a time to the
 *   parts with the largest remainders; ties go to the earlier part.
 * - Weights can be percentages (50, 30, 20), ratios or any non-negative values; at least one
 *   must be positive. Zero weights get zero.
 * - A negative total is split as its absolute value, and every part is negated.
 *
 * Example: ₺100.00 split 1:1:1 → ₺33.34, ₺33.33, ₺33.33.
 */
export function allocate(total: Money, weights: readonly DecimalInput[]): Money[] {
  if (weights.length === 0) throw new AllocationError('At least one weight is required')
  if (!total.isWholeMinor()) {
    throw new AllocationError('Total must be whole minor units; round it first')
  }

  const ws = weights.map((w) => decimal(w))
  if (ws.some((w) => w.isNegative())) throw new AllocationError('Weights must not be negative')
  const weightSum = ws.reduce((sum, w) => sum.plus(w), new Decimal(0))
  if (weightSum.isZero()) throw new AllocationError('At least one weight must be positive')

  const negative = total.isNegative()
  const totalMinor = new Decimal(total.abs().toMinor().toString())

  const shares = ws.map((w, index) => {
    const exact = totalMinor.times(w).dividedBy(weightSum)
    const floor = exact.floor()
    return { index, floor, remainder: exact.minus(floor) }
  })

  const floorSum = shares.reduce((sum, share) => sum.plus(share.floor), new Decimal(0))
  // Fewer leftover minor units than parts, since each remainder is below one.
  let leftover = BigInt(totalMinor.minus(floorSum).toFixed(0))

  const extra = new Set<number>()
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index,
  )
  for (const share of byRemainder) {
    if (leftover <= 0n) break
    extra.add(share.index)
    leftover -= 1n
  }

  return shares.map((share) => {
    const minor = BigInt(share.floor.toFixed(0)) + (extra.has(share.index) ? 1n : 0n)
    const part = Money.fromMinor(minor, total.currency)
    return negative ? part.negate() : part
  })
}
