import { getCurrency } from './currency.ts'
import { Decimal } from './decimal.ts'
import { SEPARATORS, type NumberLocale } from './locale.ts'
import { MAX_ABS_AMOUNT, Money } from './money.ts'

export type ParseError = 'empty' | 'invalid' | 'too_many_decimals' | 'out_of_range'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError }

const MAX_INPUT_LENGTH = 64

// Currency symbols and codes users may type or paste along with the amount.
const CURRENCY_NOISE = /₺|\$|€|£|(?<![a-z])(?:TL|TRY|USD|EUR|GBP)(?![a-z])/giu
// \s includes no-break spaces (U+00A0, U+202F) that formatted numbers often contain.
const WHITESPACE = /[\s']/gu
// Minus sign (U+2212), en dash and em dash, as pasted from formatted text.
const DASHES = /[−–—]/gu

const fail = (error: ParseError): ParseResult<never> => ({ ok: false, error })

function escapeRegExp(char: string) {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isGrouped(integerPart: string, separator: string, minGroups: number): boolean {
  const s = escapeRegExp(separator)
  return new RegExp(`^\\d{1,3}(?:${s}\\d{3}){${minGroups},}$`).test(integerPart)
}

/**
 * Parses one unsigned number written with `.` and/or `,`.
 * - Both present: the last one is the decimal separator, the other groups thousands.
 * - One kind, several times: thousands grouping (`1.000.000`).
 * - One kind, once: the locale's decimal separator is decimal. The other character is grouping
 *   only when followed by exactly three digits (`1.500` in tr, `1,500` in en); otherwise it is
 *   read as a decimal point, so `12.5` works in Turkish too.
 */
function parseTerm(term: string, locale: NumberLocale): Decimal | null {
  if (!/^[\d.,]+$/.test(term) || !/\d/.test(term)) return null

  const dots = term.split('.').length - 1
  const commas = term.split(',').length - 1
  let integerPart = term
  let fractionPart = ''

  if (dots > 0 && commas > 0) {
    const decimalSeparator = term.lastIndexOf('.') > term.lastIndexOf(',') ? '.' : ','
    const groupSeparator = decimalSeparator === '.' ? ',' : '.'
    const at = term.lastIndexOf(decimalSeparator)
    integerPart = term.slice(0, at)
    fractionPart = term.slice(at + 1)
    if (integerPart.includes(decimalSeparator)) return null
    if (!isGrouped(integerPart, groupSeparator, 1)) return null
    integerPart = integerPart.split(groupSeparator).join('')
  } else if (dots + commas > 1) {
    const separator = dots > 0 ? '.' : ','
    if (!isGrouped(term, separator, 2)) return null
    integerPart = term.split(separator).join('')
  } else if (dots + commas === 1) {
    const separator = dots > 0 ? '.' : ','
    const isGrouping = separator !== SEPARATORS[locale].decimal && isGrouped(term, separator, 1)
    const at = term.indexOf(separator)
    if (isGrouping) {
      integerPart = term.slice(0, at) + term.slice(at + 1)
    } else {
      integerPart = term.slice(0, at)
      fractionPart = term.slice(at + 1)
    }
  }

  // Both parts are digits only here: the decimal separator is the last separator in the term.
  return new Decimal(`${integerPart || '0'}.${fractionPart || '0'}`)
}

/**
 * Parses what a person types into an amount field, in either number convention:
 * `50.000,50`, `50,000.50`, `₺ 1.250`, `-12,5`, and simple sums such as `1200+350` or `500-120`.
 * Never produces a float.
 */
export function parseDecimalInput(input: string, locale: NumberLocale): ParseResult<Decimal> {
  if (input.length > MAX_INPUT_LENGTH) return fail('invalid')
  const normalized = input.replace(CURRENCY_NOISE, '').replace(WHITESPACE, '').replace(DASHES, '-')
  if (normalized === '') return fail('empty')

  let total = new Decimal(0)
  let sign = 1
  let index = 0
  if (normalized[0] === '+' || normalized[0] === '-') {
    sign = normalized[0] === '-' ? -1 : 1
    index = 1
  }

  let term = ''
  const addTerm = () => {
    const value = parseTerm(term, locale)
    if (value === null) return false
    total = sign < 0 ? total.minus(value) : total.plus(value)
    return true
  }

  for (; index < normalized.length; index++) {
    const char = normalized.charAt(index)
    if (char === '+' || char === '-') {
      if (!addTerm()) return fail('invalid')
      term = ''
      sign = char === '-' ? -1 : 1
    } else {
      term += char
    }
  }
  if (!addTerm()) return fail('invalid')

  return { ok: true, value: total }
}

/** Parses an amount for a currency, rejecting more decimals than it has and out-of-range values. */
export function parseMoneyInput(
  input: string,
  currency: string,
  locale: NumberLocale,
): ParseResult<Money> {
  const info = getCurrency(currency)
  const parsed = parseDecimalInput(input, locale)
  if (!parsed.ok) return parsed
  if (parsed.value.decimalPlaces() > info.minorUnits) return fail('too_many_decimals')
  if (parsed.value.abs().greaterThan(MAX_ABS_AMOUNT)) return fail('out_of_range')
  return { ok: true, value: Money.of(parsed.value, info.code) }
}
