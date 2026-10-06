import * as decimalJs from 'decimal.js'

// decimal.js ships CommonJS-style typings next to an ESM build that only has a default export.
// At runtime (Node and Vite) the namespace's `default` is the constructor; TypeScript reads the
// typings as CommonJS and disagrees, so we state the real type. Covered by decimal.test.ts.
const DecimalJs = decimalJs.default as unknown as typeof decimalJs.Decimal

/**
 * The only number type for money, quantities, prices and FX rates.
 *
 * An isolated decimal.js constructor, so global config elsewhere can't change our behavior.
 * - 50 significant digits: far more than NUMERIC(30,12) needs, so intermediate results stay exact.
 * - ROUND_HALF_UP rounds ties away from zero (2.5 → 3, −2.5 → −3), the usual commercial rounding.
 */
export const Decimal = DecimalJs.clone({
  precision: 50,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
})
export type Decimal = InstanceType<typeof Decimal>

export type DecimalInput = Decimal | string | bigint | number

/** Plain decimal notation as used on the wire and in the database: `-12000.50`. */
export const DECIMAL_STRING_PATTERN = /^-?\d+(\.\d+)?$/

export class InvalidDecimalError extends Error {
  override name = 'InvalidDecimalError'
}

/**
 * Builds a Decimal. Strings must be plain decimal notation. Numbers are accepted only as
 * safe integers (counts such as days), so a float can never sneak into money math.
 */
export function decimal(value: DecimalInput): Decimal {
  if (value instanceof Decimal) return value
  if (typeof value === 'bigint') return new Decimal(value.toString())
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new InvalidDecimalError('Only safe integers may be converted from number')
    }
    return new Decimal(value)
  }
  if (!DECIMAL_STRING_PATTERN.test(value)) {
    throw new InvalidDecimalError(`Not a plain decimal string: "${value}"`)
  }
  return new Decimal(value)
}

export function isDecimalString(value: string): boolean {
  return DECIMAL_STRING_PATTERN.test(value)
}

/** Number of digits after the decimal point, ignoring trailing zeros. */
export function fractionDigits(value: Decimal): number {
  return value.decimalPlaces()
}
