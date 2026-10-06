import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatDecimal, formatMoney } from './format.ts'
import { NUMBER_LOCALES } from './locale.ts'
import { Money } from './money.ts'
import { parseDecimalInput, parseMoneyInput } from './parse.ts'
import { arbTry } from './testing/arbitraries.ts'

function value(input: string, locale: 'en' | 'tr') {
  const result = parseDecimalInput(input, locale)
  return result.ok ? result.value.toFixed() : result.error
}

describe('parseDecimalInput', () => {
  it.each([
    // Both conventions work in both locales when unambiguous
    ['50.000,50', 'en', '50000.5'],
    ['50.000,50', 'tr', '50000.5'],
    ['50,000.50', 'en', '50000.5'],
    ['50,000.50', 'tr', '50000.5'],
    ['1.234.567', 'tr', '1234567'],
    ['1,234,567', 'en', '1234567'],
    ['1.234.567,8', 'tr', '1234567.8'],
    // A single separator: the locale decides
    ['12,5', 'tr', '12.5'],
    ['12.5', 'en', '12.5'],
    ['12.5', 'tr', '12.5'],
    ['12,5', 'en', '12.5'],
    ['1.500', 'tr', '1500'],
    ['1.500', 'en', '1.5'],
    ['1,500', 'en', '1500'],
    ['1,500', 'tr', '1.5'],
    ['0,05', 'tr', '0.05'],
    [',5', 'tr', '0.5'],
    ['5,', 'tr', '5'],
    // Plain numbers, signs, sums
    ['50000', 'en', '50000'],
    ['007', 'en', '7'],
    ['-12,5', 'tr', '-12.5'],
    ['+12', 'en', '12'],
    ['1200+350', 'tr', '1550'],
    ['500-120,50', 'tr', '379.5'],
    ['-100+30', 'en', '-70'],
    ['1.200,50 + 350', 'tr', '1550.5'],
    // Typographic minus, currency noise and spaces
    ['−1.250,00', 'tr', '-1250'],
    ['₺ 1.250', 'tr', '1250'],
    ['1.250 TL', 'tr', '1250'],
    ['50TL', 'tr', '50'],
    ['$1,250.99', 'en', '1250.99'],
    ['1 250,99', 'tr', '1250.99'],
    [`1${String.fromCharCode(0xa0)}250`, 'tr', '1250'],
  ] as const)('%j in %s → %s', (input, locale, expected) => {
    expect(value(input, locale)).toBe(expected)
  })

  it.each(['', '   ', '₺', 'TL'])('%j is empty', (input) => {
    expect(value(input, 'tr')).toBe('empty')
  })

  it.each([
    'abc',
    '12a',
    '1..2',
    '1,2,3',
    '12,34,567',
    '1.2.3',
    '1,23.4',
    '1.234,5.6',
    '1+',
    '+',
    '--1',
    '1++2',
    '12e3',
    '1/2',
    '.',
    '1'.repeat(65),
  ])('%j is invalid', (input) => {
    expect(value(input, 'en')).toBe('invalid')
  })
})

describe('parseMoneyInput', () => {
  it('returns Money in the requested currency', () => {
    const result = parseMoneyInput('85', 'TRY', 'tr')
    expect(result.ok && result.value.equals(Money.of('85', 'TRY'))).toBe(true)
  })

  it('rejects more decimals than the currency has', () => {
    expect(parseMoneyInput('12,345', 'TRY', 'tr')).toEqual({
      ok: false,
      error: 'too_many_decimals',
    })
  })

  it('accepts trailing zeros beyond minor units', () => {
    const result = parseMoneyInput('12,500', 'TRY', 'tr')
    expect(result.ok && result.value.toDto().amount).toBe('12.50')
  })

  it('rejects amounts beyond the database range', () => {
    expect(parseMoneyInput('99999999999999999', 'TRY', 'en')).toEqual({
      ok: false,
      error: 'out_of_range',
    })
  })

  it('passes through parse errors', () => {
    expect(parseMoneyInput('', 'TRY', 'en')).toEqual({ ok: false, error: 'empty' })
  })
})

describe('parse/format round trip', () => {
  it('parses what formatMoney prints, in every locale and display', () => {
    fc.assert(
      fc.property(
        arbTry,
        fc.constantFrom(...NUMBER_LOCALES),
        fc.constantFrom<'symbol' | 'code' | 'none'>('symbol', 'code', 'none'),
        fc.boolean(),
        (money, locale, currencyDisplay, useGrouping) => {
          const text = formatMoney(money, locale, { currencyDisplay, useGrouping })
          const parsed = parseMoneyInput(text, 'TRY', locale)
          return parsed.ok && parsed.value.equals(money)
        },
      ),
    )
  })

  it('parses grouped integers in either locale', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.constantFrom(...NUMBER_LOCALES),
        (n, locale) => {
          const text = formatDecimal(n, locale, { fractionDigits: 0 })
          const parsed = parseDecimalInput(text, locale)
          return parsed.ok && parsed.value.toFixed() === n.toString()
        },
      ),
    )
  })
})
