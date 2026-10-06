export interface CurrencyInfo {
  readonly code: CurrencyCode
  /** Digits after the decimal point (2 for kuruş/cents). */
  readonly minorUnits: number
  readonly symbol: string
}

/**
 * Currencies Mizan can represent. Must match the `currencies` seed migration.
 * Gold and crypto are assets, not currencies.
 */
export const CURRENCIES = {
  TRY: { code: 'TRY', minorUnits: 2, symbol: '₺' },
  USD: { code: 'USD', minorUnits: 2, symbol: '$' },
  EUR: { code: 'EUR', minorUnits: 2, symbol: '€' },
  GBP: { code: 'GBP', minorUnits: 2, symbol: '£' },
} as const satisfies Record<string, { code: string; minorUnits: number; symbol: string }>

export type CurrencyCode = keyof typeof CURRENCIES

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[]

export const DEFAULT_CURRENCY: CurrencyCode = 'TRY'

export class UnknownCurrencyError extends Error {
  override name = 'UnknownCurrencyError'
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && Object.hasOwn(CURRENCIES, value)
}

export function getCurrency(code: string): CurrencyInfo {
  if (!isCurrencyCode(code)) throw new UnknownCurrencyError(`Unknown currency: ${code}`)
  return CURRENCIES[code]
}
