import { describe, expect, it } from 'vitest'
import {
  CURRENCIES,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
  getCurrency,
  isCurrencyCode,
  UnknownCurrencyError,
} from './currency.ts'

describe('currency registry', () => {
  it('matches the currencies seed migration', () => {
    expect(CURRENCY_CODES.sort()).toEqual(['EUR', 'GBP', 'TRY', 'USD'])
    expect(CURRENCIES.TRY).toEqual({ code: 'TRY', minorUnits: 2, symbol: '₺' })
  })

  it('defaults to TRY', () => {
    expect(DEFAULT_CURRENCY).toBe('TRY')
  })

  it('looks up known codes', () => {
    expect(getCurrency('USD').symbol).toBe('$')
  })

  it.each(['try', 'XAU', '', 'toString', '__proto__'])('rejects %j', (code) => {
    expect(isCurrencyCode(code)).toBe(false)
    expect(() => getCurrency(code)).toThrow(UnknownCurrencyError)
  })

  it('rejects non-strings', () => {
    expect(isCurrencyCode(42)).toBe(false)
  })
})
