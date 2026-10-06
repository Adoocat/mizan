import { describe, expect, it } from 'vitest'
import {
  Decimal,
  decimal,
  fractionDigits,
  InvalidDecimalError,
  isDecimalString,
} from './decimal.ts'

describe('Decimal', () => {
  it('is exact where floats are not', () => {
    expect(decimal('0.1').plus('0.2').toFixed()).toBe('0.3')
    expect(decimal('1.005').toDecimalPlaces(2).toFixed()).toBe('1.01')
  })

  it('rounds ties half-up, away from zero', () => {
    expect(decimal('2.5').toDecimalPlaces(0).toFixed()).toBe('3')
    expect(decimal('-2.5').toDecimalPlaces(0).toFixed()).toBe('-3')
    expect(decimal('2.4999').toDecimalPlaces(0).toFixed()).toBe('2')
  })

  it('keeps 50 significant digits', () => {
    expect(decimal(1).dividedBy(3).toFixed()).toBe(`0.${'3'.repeat(50)}`)
  })

  it('is isolated from the global decimal.js configuration', () => {
    expect(Decimal.precision).toBe(50)
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_UP)
  })
})

describe('decimal()', () => {
  it('accepts plain decimal strings, bigints, safe integers and Decimals', () => {
    expect(decimal('-12000.50').toFixed()).toBe('-12000.5')
    expect(decimal(12n).toFixed()).toBe('12')
    expect(decimal(30).toFixed()).toBe('30')
    const d = decimal('1')
    expect(decimal(d)).toBe(d)
  })

  it.each(['1e5', '1,5', ' 1', '', '.5', '5.', 'NaN', 'Infinity', '0x10', '+1'])(
    'rejects %j',
    (input) => {
      expect(() => decimal(input)).toThrow(InvalidDecimalError)
    },
  )

  it.each([0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60])(
    'rejects the non-safe-integer number %s',
    (input) => {
      expect(() => decimal(input)).toThrow(InvalidDecimalError)
    },
  )
})

describe('helpers', () => {
  it('isDecimalString', () => {
    expect(isDecimalString('-1.50')).toBe(true)
    expect(isDecimalString('1.')).toBe(false)
  })

  it('fractionDigits ignores trailing zeros', () => {
    expect(fractionDigits(decimal('1.500'))).toBe(1)
    expect(fractionDigits(decimal('100'))).toBe(0)
  })
})
