import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { allocate, AllocationError } from './allocate.ts'
import { decimal } from './decimal.ts'
import { Money } from './money.ts'
import { arbTry } from './testing/arbitraries.ts'

const tl = (amount: string) => Money.of(amount, 'TRY')
const amounts = (parts: Money[]) => parts.map((p) => p.toDto().amount)

describe('allocate (largest remainder)', () => {
  it('splits ₺100 three ways and gives the extra kuruş to the first part', () => {
    expect(amounts(allocate(tl('100'), [1, 1, 1]))).toEqual(['33.34', '33.33', '33.33'])
  })

  it('splits a ₺50,000 salary 50/30/20 exactly', () => {
    expect(amounts(allocate(tl('50000'), [50, 30, 20]))).toEqual([
      '25000.00',
      '15000.00',
      '10000.00',
    ])
  })

  it('gives leftover kuruş to the largest remainders, not the first parts', () => {
    // Exact shares in kuruş: 1.6, 1.6, 6.8 → floors 1, 1, 6 (sum 8); 2 left → remainders .6, .6, .8
    expect(amounts(allocate(tl('0.10'), [16, 16, 68]))).toEqual(['0.02', '0.01', '0.07'])
  })

  it('accepts decimal string weights', () => {
    expect(amounts(allocate(tl('10'), ['0.5', '0.25', '0.25']))).toEqual(['5.00', '2.50', '2.50'])
  })

  it('gives zero to zero weights', () => {
    expect(amounts(allocate(tl('10'), [0, 1, 0]))).toEqual(['0.00', '10.00', '0.00'])
  })

  it('splits negative totals symmetrically', () => {
    expect(amounts(allocate(tl('-100'), [1, 1, 1]))).toEqual(['-33.34', '-33.33', '-33.33'])
  })

  it('handles a zero total', () => {
    expect(amounts(allocate(tl('0'), [1, 2]))).toEqual(['0.00', '0.00'])
  })

  it.each([
    ['no weights', tl('1'), []],
    ['negative weight', tl('1'), [1, -1]],
    ['all-zero weights', tl('1'), [0, 0]],
    ['sub-kuruş total', tl('1.005'), [1, 1]],
  ])('rejects %s', (_label, total, weights) => {
    expect(() => allocate(total, weights)).toThrow(AllocationError)
  })
})

const arbWeights = fc
  .array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 12 })
  .filter((ws) => ws.some((w) => w > 0))

describe('allocate properties', () => {
  it('parts always sum exactly to the total', () => {
    fc.assert(
      fc.property(arbTry, arbWeights, (total, weights) =>
        Money.sum(allocate(total, weights), 'TRY').equals(total),
      ),
    )
  })

  it('each part is within one kuruş of its exact share', () => {
    fc.assert(
      fc.property(arbTry, arbWeights, (total, weights) => {
        const sum = weights.reduce((a, b) => a + b, 0)
        return allocate(total, weights).every((part, i) => {
          const exact = total.times(weights[i] ?? 0).dividedBy(sum)
          return part.minus(exact).abs().lessThan(tl('0.01'))
        })
      }),
    )
  })

  it('returns one part per weight, all in whole kuruş', () => {
    fc.assert(
      fc.property(arbTry, arbWeights, (total, weights) => {
        const parts = allocate(total, weights)
        return parts.length === weights.length && parts.every((p) => p.isWholeMinor())
      }),
    )
  })

  it('scaling all weights does not change the result', () => {
    fc.assert(
      fc.property(arbTry, arbWeights, fc.integer({ min: 2, max: 1000 }), (total, weights, k) => {
        const scaled = weights.map((w) => decimal(w).times(k))
        return allocate(total, weights).every((part, i) => part.equals(allocate(total, scaled)[i]!))
      }),
    )
  })
})
