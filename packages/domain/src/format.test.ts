import { describe, expect, it } from 'vitest'
import { formatDecimal, formatMoney, formatPercent } from './format.ts'
import { MINUS_SIGN } from './locale.ts'
import { Money } from './money.ts'

const tl = (amount: string) => Money.of(amount, 'TRY')
const NBSP = String.fromCharCode(0xa0)
const M = MINUS_SIGN

describe('formatMoney', () => {
  it.each([
    ['50000', 'en', '₺50,000.00'],
    ['50000', 'tr', '₺50.000,00'],
    ['50000.5', 'en', '₺50,000.50'],
    ['50000.5', 'tr', '₺50.000,50'],
    ['1060200', 'en', '₺1,060,200.00'],
    ['999', 'en', '₺999.00'],
    ['0', 'en', '₺0.00'],
    ['0.005', 'en', '₺0.01'],
    ['-1250', 'en', `${M}₺1,250.00`],
    ['-1250', 'tr', `${M}₺1.250,00`],
  ] as const)('%s in %s → %s', (amount, locale, expected) => {
    expect(formatMoney(tl(amount), locale)).toBe(expected)
  })

  it('formats whole units like the mockups (₺50,000)', () => {
    expect(formatMoney(tl('50000.49'), 'en', { fractionDigits: 'none' })).toBe('₺50,000')
    expect(formatMoney(tl('2350.5'), 'en', { fractionDigits: 'none' })).toBe('₺2,351')
  })

  it('does not show a sign when rounding reaches zero', () => {
    expect(formatMoney(tl('-0.4'), 'en', { fractionDigits: 'none' })).toBe('₺0')
    expect(formatMoney(tl('-0.004'), 'en')).toBe('₺0.00')
  })

  it('supports explicit signs', () => {
    expect(formatMoney(tl('4000'), 'en', { signDisplay: 'always' })).toBe('+₺4,000.00')
    expect(formatMoney(tl('-4000'), 'en', { signDisplay: 'always' })).toBe(`${M}₺4,000.00`)
    expect(formatMoney(tl('0'), 'en', { signDisplay: 'always' })).toBe('₺0.00')
    expect(formatMoney(tl('-4000'), 'en', { signDisplay: 'never' })).toBe('₺4,000.00')
  })

  it('supports currency code and no currency', () => {
    expect(formatMoney(tl('12.5'), 'tr', { currencyDisplay: 'code' })).toBe(`TRY${NBSP}12,50`)
    expect(formatMoney(tl('12.5'), 'tr', { currencyDisplay: 'none' })).toBe('12,50')
  })

  it('can turn grouping off', () => {
    expect(formatMoney(tl('12345.6'), 'tr', { useGrouping: false })).toBe('₺12345,60')
  })

  it('uses each currency symbol', () => {
    expect(formatMoney(Money.of('10', 'USD'), 'en')).toBe('$10.00')
    expect(formatMoney(Money.of('10', 'EUR'), 'tr')).toBe('€10,00')
  })
})

describe('formatDecimal', () => {
  it('formats plain numbers in both locales', () => {
    expect(formatDecimal('280.5556', 'en', { fractionDigits: 4 })).toBe('280.5556')
    expect(formatDecimal('1234567.891', 'tr', { fractionDigits: 2 })).toBe('1.234.567,89')
    expect(formatDecimal('-3', 'en', { fractionDigits: 0 })).toBe(`${M}3`)
  })
})

describe('formatPercent', () => {
  it.each([
    ['0.5', 'en', 0, '50%'],
    ['0.5', 'tr', 0, '%50'],
    ['0.035', 'en', 1, '3.5%'],
    ['0.035', 'tr', 1, '%3,5'],
    ['0.7149', 'en', 0, '71%'],
    ['0.715', 'en', 0, '72%'],
    ['-0.0407', 'en', 2, `${M}4.07%`],
  ] as const)('%s in %s with %i digits → %s', (ratio, locale, digits, expected) => {
    expect(formatPercent(ratio, locale, { fractionDigits: digits })).toBe(expected)
  })

  it('defaults to whole percents and can show a plus sign', () => {
    expect(formatPercent('0.1', 'en')).toBe('10%')
    expect(formatPercent('0.1', 'tr', { signDisplay: 'always' })).toBe('+%10')
  })
})
