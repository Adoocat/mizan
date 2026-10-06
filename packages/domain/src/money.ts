import { getCurrency, type CurrencyCode } from './currency.ts'
import { Decimal, decimal, type DecimalInput } from './decimal.ts'

/** Wire format for money: `{"amount": "12000.00", "currency": "TRY"}`. */
export interface MoneyDto {
  amount: string
  currency: string
}

/** Largest absolute amount that fits NUMERIC(20,4): 16 integer digits. */
export const MAX_ABS_AMOUNT = new Decimal('9999999999999999.9999')

export class CurrencyMismatchError extends Error {
  override name = 'CurrencyMismatchError'
}

export class InvalidMoneyError extends Error {
  override name = 'InvalidMoneyError'
}

/**
 * An exact amount in one currency. Immutable.
 *
 * Arithmetic keeps full precision. Rounding to minor units (half-up) happens only at
 * boundaries: `roundToMinor()`, `toDto()` and display formatting.
 */
export class Money {
  readonly amount: Decimal
  readonly currency: CurrencyCode

  private constructor(amount: Decimal, currency: CurrencyCode) {
    // Normalize −0 so equality and formatting never see a negative zero.
    this.amount = amount.isZero() ? new Decimal(0) : amount
    this.currency = currency
  }

  static of(amount: DecimalInput, currency: string): Money {
    const info = getCurrency(currency)
    return new Money(decimal(amount), info.code)
  }

  static zero(currency: string): Money {
    return Money.of(0, currency)
  }

  /** From an integer count of minor units: `fromMinor(1250n, 'TRY')` is ₺12.50. */
  static fromMinor(minor: bigint, currency: string): Money {
    const info = getCurrency(currency)
    return new Money(new Decimal(minor.toString()).dividedBy(10 ** info.minorUnits), info.code)
  }

  /**
   * Parses the wire format strictly: plain decimal string, a known currency, no more fraction
   * digits than the currency allows, and within the NUMERIC(20,4) range.
   */
  static fromDto(dto: MoneyDto): Money {
    const info = getCurrency(dto.currency)
    const amount = decimal(dto.amount)
    if (amount.decimalPlaces() > info.minorUnits) {
      throw new InvalidMoneyError(`${info.code} allows at most ${info.minorUnits} decimal places`)
    }
    if (amount.abs().greaterThan(MAX_ABS_AMOUNT)) {
      throw new InvalidMoneyError('Amount is out of range')
    }
    return new Money(amount, info.code)
  }

  /** Sum of amounts in one currency. An empty list needs the currency to return zero. */
  static sum(items: readonly Money[], currency: string): Money {
    return items.reduce((total, item) => total.plus(item), Money.zero(currency))
  }

  static min(a: Money, b: Money): Money {
    return a.lessThanOrEqual(b) ? a : b
  }

  static max(a: Money, b: Money): Money {
    return a.greaterThanOrEqual(b) ? a : b
  }

  get minorUnits(): number {
    return getCurrency(this.currency).minorUnits
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.amount.plus(other.amount), this.currency)
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.amount.minus(other.amount), this.currency)
  }

  /** Multiplies by a factor (a rate, a ratio, a count). The result is not rounded. */
  times(factor: DecimalInput): Money {
    return new Money(this.amount.times(decimal(factor)), this.currency)
  }

  /** Divides by a non-zero divisor. The result is not rounded. */
  dividedBy(divisor: DecimalInput): Money {
    const d = decimal(divisor)
    if (d.isZero()) throw new RangeError('Division by zero')
    return new Money(this.amount.dividedBy(d), this.currency)
  }

  negate(): Money {
    return new Money(this.amount.negated(), this.currency)
  }

  abs(): Money {
    return new Money(this.amount.abs(), this.currency)
  }

  /** Rounds half-up (ties away from zero) to the currency's minor units. */
  roundToMinor(): Money {
    return new Money(
      this.amount.toDecimalPlaces(this.minorUnits, Decimal.ROUND_HALF_UP),
      this.currency,
    )
  }

  /** True when the amount has no digits beyond the currency's minor units. */
  isWholeMinor(): boolean {
    return this.amount.decimalPlaces() <= this.minorUnits
  }

  /** The amount rounded half-up, as an integer count of minor units. */
  toMinor(): bigint {
    return BigInt(
      this.amount
        .times(10 ** this.minorUnits)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toFixed(0),
    )
  }

  isZero(): boolean {
    return this.amount.isZero()
  }

  isPositive(): boolean {
    return this.amount.greaterThan(0)
  }

  isNegative(): boolean {
    return this.amount.lessThan(0)
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other)
    return this.amount.comparedTo(other.amount) as -1 | 0 | 1
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount)
  }

  greaterThan(other: Money): boolean {
    return this.compare(other) > 0
  }

  greaterThanOrEqual(other: Money): boolean {
    return this.compare(other) >= 0
  }

  lessThan(other: Money): boolean {
    return this.compare(other) < 0
  }

  lessThanOrEqual(other: Money): boolean {
    return this.compare(other) <= 0
  }

  /** Wire format, rounded half-up to minor units with a fixed number of decimals. */
  toDto(): MoneyDto {
    return {
      amount: this.amount.toFixed(this.minorUnits, Decimal.ROUND_HALF_UP),
      currency: this.currency,
    }
  }

  toJSON(): MoneyDto {
    return this.toDto()
  }

  /** Debug representation. Use `formatMoney` for anything a user sees. */
  toString(): string {
    return `${this.amount.toFixed()} ${this.currency}`
  }

  private assertSameCurrency(other: Money) {
    if (other.currency !== this.currency) {
      throw new CurrencyMismatchError(`Cannot combine ${this.currency} with ${other.currency}`)
    }
  }
}
