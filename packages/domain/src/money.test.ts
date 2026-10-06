import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { UnknownCurrencyError } from './currency.ts'
import { CurrencyMismatchError, InvalidMoneyError, Money } from './money.ts'
import { arbMinor, arbTry } from './testing/arbitraries.ts'

const tl = (amount: string) => Money.of(amount, 'TRY')

describe('Money construction', () => {
  it('keeps the exact amount', () => {
    expect(tl('12000.505').amount.toFixed()).toBe('12000.505')
  })

  it('rejects unknown currencies', () => {
    expect(() => Money.of('1', 'XAU')).toThrow(UnknownCurrencyError)
  })

  it('builds from minor units', () => {
    expect(Money.fromMinor(1250n, 'TRY').equals(tl('12.50'))).toBe(true)
    expect(Money.fromMinor(-1n, 'TRY').equals(tl('-0.01'))).toBe(true)
  })

  it('normalizes negative zero', () => {
    const zero = tl('5').minus(tl('5')).negate()
    expect(zero.isZero()).toBe(true)
    expect(zero.amount.isNegative()).toBe(false)
    expect(zero.toDto().amount).toBe('0.00')
  })
})

describe('Money arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(tl('0.1').plus(tl('0.2')).equals(tl('0.3'))).toBe(true)
    expect(tl('50000').minus(tl('27000')).equals(tl('23000'))).toBe(true)
  })

  it('refuses to mix currencies', () => {
    expect(() => tl('1').plus(Money.of('1', 'USD'))).toThrow(CurrencyMismatchError)
    expect(() => tl('1').compare(Money.of('1', 'USD'))).toThrow(CurrencyMismatchError)
  })

  it('multiplies and divides without rounding', () => {
    expect(tl('9000').minus(tl('6000')).dividedBy(10).equals(tl('300'))).toBe(true)
    expect(tl('100').dividedBy(3).amount.toFixed(4)).toBe('33.3333')
    expect(tl('100').times('0.5').equals(tl('50'))).toBe(true)
  })

  it('refuses to divide by zero', () => {
    expect(() => tl('1').dividedBy(0)).toThrow(RangeError)
  })

  it('negates, takes absolute values, and sums', () => {
    expect(tl('5').negate().equals(tl('-5'))).toBe(true)
    expect(tl('-5').abs().equals(tl('5'))).toBe(true)
    expect(Money.sum([tl('1.10'), tl('2.20'), tl('3.30')], 'TRY').equals(tl('6.60'))).toBe(true)
    expect(Money.sum([], 'TRY').isZero()).toBe(true)
  })

  it('compares', () => {
    expect(tl('1').compare(tl('2'))).toBe(-1)
    expect(tl('2').greaterThan(tl('1'))).toBe(true)
    expect(tl('2').greaterThanOrEqual(tl('2'))).toBe(true)
    expect(tl('1').lessThan(tl('2'))).toBe(true)
    expect(tl('2').lessThanOrEqual(tl('2'))).toBe(true)
    expect(Money.min(tl('1'), tl('2')).equals(tl('1'))).toBe(true)
    expect(Money.min(tl('2'), tl('1')).equals(tl('1'))).toBe(true)
    expect(Money.max(tl('1'), tl('2')).equals(tl('2'))).toBe(true)
    expect(Money.max(tl('2'), tl('1')).equals(tl('2'))).toBe(true)
    expect(tl('1').equals(Money.of('1', 'USD'))).toBe(false)
    expect(tl('1').isPositive()).toBe(true)
    expect(tl('-1').isNegative()).toBe(true)
  })
})

describe('Money rounding', () => {
  it.each([
    ['1.005', '1.01'],
    ['1.004', '1.00'],
    ['-1.005', '-1.01'],
    ['2.5', '2.50'],
    ['333.333333', '333.33'],
  ])('rounds %s half-up to %s', (input, expected) => {
    expect(tl(input).roundToMinor().toDto().amount).toBe(expected)
  })

  it('reports whether an amount is whole minor units', () => {
    expect(tl('1.20').isWholeMinor()).toBe(true)
    expect(tl('1.205').isWholeMinor()).toBe(false)
  })

  it('converts to minor units, rounding half-up', () => {
    expect(tl('12.50').toMinor()).toBe(1250n)
    expect(tl('0.005').toMinor()).toBe(1n)
    expect(tl('-0.005').toMinor()).toBe(-1n)
  })
})

describe('Money wire format', () => {
  it('serializes with fixed minor digits', () => {
    expect(tl('12000').toDto()).toEqual({ amount: '12000.00', currency: 'TRY' })
    expect(JSON.stringify({ total: tl('1.5') })).toBe(
      '{"total":{"amount":"1.50","currency":"TRY"}}',
    )
  })

  it('parses valid DTOs', () => {
    expect(Money.fromDto({ amount: '-12000.50', currency: 'TRY' }).equals(tl('-12000.5'))).toBe(
      true,
    )
  })

  it.each([
    [{ amount: '1.005', currency: 'TRY' }, InvalidMoneyError],
    [{ amount: '10000000000000000', currency: 'TRY' }, InvalidMoneyError],
    [{ amount: '1e3', currency: 'TRY' }, Error],
    [{ amount: '1', currency: 'XAU' }, UnknownCurrencyError],
  ])('rejects %j', (dto, error) => {
    expect(() => Money.fromDto(dto)).toThrow(error)
  })

  it('has a readable debug string', () => {
    expect(tl('1.5').toString()).toBe('1.5 TRY')
  })
})

describe('Money properties', () => {
  it('addition is commutative and associative', () => {
    fc.assert(
      fc.property(arbTry, arbTry, arbTry, (a, b, c) => {
        expect(a.plus(b).equals(b.plus(a))).toBe(true)
        expect(
          a
            .plus(b)
            .plus(c)
            .equals(a.plus(b.plus(c))),
        ).toBe(true)
      }),
    )
  })

  it('subtraction undoes addition', () => {
    fc.assert(fc.property(arbTry, arbTry, (a, b) => a.plus(b).minus(b).equals(a)))
  })

  it('round-trips through the wire format', () => {
    fc.assert(fc.property(arbTry, (m) => Money.fromDto(m.toDto()).equals(m)))
  })

  it('round-trips through minor units', () => {
    fc.assert(fc.property(arbMinor, (minor) => Money.fromMinor(minor, 'TRY').toMinor() === minor))
  })

  it('rounding moves an amount by at most half a minor unit', () => {
    fc.assert(
      fc.property(arbMinor, fc.integer({ min: 0, max: 9999 }), (minor, extra) => {
        const precise = Money.fromMinor(minor, 'TRY').plus(
          tl(`0.00${String(extra).padStart(4, '0')}`),
        )
        const diff = precise.roundToMinor().minus(precise).abs()
        return diff.lessThanOrEqual(tl('0.005'))
      }),
    )
  })
})
