import {
  CURRENCY_CODES,
  isPeriodStartDay,
  isPlainDate,
  Money,
  type CurrencyCode,
  type PlainDate,
} from '@mizan/domain'
import { z } from 'zod'

export const currencyCodeSchema = z.enum(CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]])

/** Plain decimal string with up to 16 integer and 4 fraction digits: NUMERIC(20,4). */
export const amountStringSchema = z
  .string()
  .regex(/^-?\d{1,16}(\.\d{1,4})?$/, 'Must be a decimal string like "12000.50"')

/**
 * Money on the wire: `{"amount": "12000.00", "currency": "TRY"}`.
 * Amounts are strings so they never become JavaScript floats. Also checks the currency's
 * minor units (at most 2 decimals for TRY).
 */
export const moneySchema = z
  .object({ amount: amountStringSchema, currency: currencyCodeSchema })
  .superRefine((value, ctx) => {
    try {
      Money.fromDto(value)
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: `Too many decimal places for ${value.currency}`,
      })
    }
  })

export type MoneyDto = z.infer<typeof moneySchema>

/** Parses a validated DTO into domain Money. */
export const moneyFromDto = (dto: MoneyDto): Money => Money.fromDto(dto)

/** Business date `YYYY-MM-DD` (a calendar date, not an instant). */
export const plainDateSchema: z.ZodType<PlainDate, string> = z
  .string()
  .refine(isPlainDate, 'Must be a valid date in YYYY-MM-DD format')

export const periodStartDaySchema = z
  .number()
  .int()
  .refine(isPeriodStartDay, 'Must be a whole number from 1 to 28')
