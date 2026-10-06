import { getCurrency } from './currency.ts'
import { Decimal, decimal, type DecimalInput } from './decimal.ts'
import { MINUS_SIGN, SEPARATORS, type NumberLocale } from './locale.ts'
import type { Money } from './money.ts'

/**
 * Number formatting is implemented here rather than with `Intl.NumberFormat`, so output is
 * byte-for-byte identical in Node and every browser, and values never pass through a float.
 */

export type SignDisplay =
  /** Minus for negatives only. */
  | 'auto'
  /** Plus for positives, minus for negatives, nothing for zero. */
  | 'always'
  /** Never show a sign (the caller conveys direction another way). */
  | 'never'

export interface FormatDecimalOptions {
  /** Exact number of fraction digits; the value is rounded half-up. */
  fractionDigits: number
  signDisplay?: SignDisplay
  useGrouping?: boolean
}

function groupInteger(digits: string, separator: string): string {
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += separator
    out += digits.charAt(i)
  }
  return out
}

function signFor(value: Decimal, signDisplay: SignDisplay): string {
  if (signDisplay === 'never' || value.isZero()) return ''
  if (value.isNegative()) return MINUS_SIGN
  return signDisplay === 'always' ? '+' : ''
}

/** Rounds and splits a value: sign, grouped integer part and fraction part. */
function formatParts(
  value: Decimal,
  locale: NumberLocale,
  fractionDigits: number,
  signDisplay: SignDisplay,
  useGrouping: boolean,
) {
  const rounded = value.toDecimalPlaces(fractionDigits, Decimal.ROUND_HALF_UP)
  const [integerDigits = '0', fraction = ''] = rounded.abs().toFixed(fractionDigits).split('.')
  const { group, decimal: decimalSeparator } = SEPARATORS[locale]
  const integer = useGrouping ? groupInteger(integerDigits, group) : integerDigits
  return {
    sign: signFor(rounded, signDisplay),
    number: fraction ? `${integer}${decimalSeparator}${fraction}` : integer,
  }
}

/** `formatDecimal(d('1234.5'), 'tr', { fractionDigits: 2 })` → `1.234,50` */
export function formatDecimal(
  value: DecimalInput,
  locale: NumberLocale,
  options: FormatDecimalOptions,
): string {
  const { sign, number } = formatParts(
    decimal(value),
    locale,
    options.fractionDigits,
    options.signDisplay ?? 'auto',
    options.useGrouping ?? true,
  )
  return `${sign}${number}`
}

export interface FormatMoneyOptions {
  /** `minor` (default): the currency's decimals, `₺4,000.00`. `none`: whole units, `₺4,000`. */
  fractionDigits?: 'minor' | 'none'
  signDisplay?: SignDisplay
  /** `symbol` (default): `₺50`. `code`: `TRY 50`. `none`: `50`. */
  currencyDisplay?: 'symbol' | 'code' | 'none'
  useGrouping?: boolean
}

/**
 * Formats money for display, rounding half-up.
 * en: `₺50,000.50`, `−₺1,250.00`. tr: `₺50.000,50`, `−₺1.250,00`.
 */
export function formatMoney(
  money: Money,
  locale: NumberLocale,
  options: FormatMoneyOptions = {},
): string {
  const info = getCurrency(money.currency)
  const fractionDigits = options.fractionDigits === 'none' ? 0 : info.minorUnits
  const { sign, number } = formatParts(
    money.amount,
    locale,
    fractionDigits,
    options.signDisplay ?? 'auto',
    options.useGrouping ?? true,
  )
  switch (options.currencyDisplay ?? 'symbol') {
    case 'symbol':
      return `${sign}${info.symbol}${number}`
    case 'code':
      return `${sign}${info.code}\u00a0${number}`
    case 'none':
      return `${sign}${number}`
  }
}

export interface FormatPercentOptions {
  fractionDigits?: number
  signDisplay?: SignDisplay
}

/**
 * Formats a ratio as a percentage, rounding half-up.
 * `formatPercent('0.125', 'en', { fractionDigits: 1 })` → `12.5%`; in `tr` → `%12,5`.
 */
export function formatPercent(
  ratio: DecimalInput,
  locale: NumberLocale,
  options: FormatPercentOptions = {},
): string {
  const { sign, number } = formatParts(
    decimal(ratio).times(100),
    locale,
    options.fractionDigits ?? 0,
    options.signDisplay ?? 'auto',
    true,
  )
  return locale === 'tr' ? `${sign}%${number}` : `${sign}${number}%`
}
