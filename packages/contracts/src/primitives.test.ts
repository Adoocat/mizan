import { describe, expect, it } from 'vitest'
import {
  currencyCodeSchema,
  moneyFromDto,
  moneySchema,
  periodStartDaySchema,
  plainDateSchema,
} from './primitives.ts'

describe('moneySchema', () => {
  it('accepts the wire format', () => {
    const dto = { amount: '12000.00', currency: 'TRY' }
    expect(moneySchema.parse(dto)).toEqual(dto)
    expect(moneyFromDto(moneySchema.parse(dto)).toDto()).toEqual(dto)
  })

  it.each([
    [{ amount: 12000, currency: 'TRY' }, 'number amount'],
    [{ amount: '1.5e3', currency: 'TRY' }, 'exponent'],
    [{ amount: '1.005', currency: 'TRY' }, 'too many decimals for TRY'],
    [{ amount: '12345678901234567', currency: 'TRY' }, 'too many digits'],
    [{ amount: '10', currency: 'XAU' }, 'unknown currency'],
    [{ amount: '10' }, 'missing currency'],
  ] as [unknown, string][])('rejects %j (%s)', (dto) => {
    expect(moneySchema.safeParse(dto).success).toBe(false)
  })
})

describe('plainDateSchema', () => {
  it('accepts real dates', () => {
    expect(plainDateSchema.parse('2024-02-29')).toBe('2024-02-29')
  })

  it.each(['2026-02-29', '06.10.2026', '2026-10-06T00:00:00Z', ''])('rejects %j', (value) => {
    expect(plainDateSchema.safeParse(value).success).toBe(false)
  })
})

describe('periodStartDaySchema', () => {
  it('accepts 1–28', () => {
    expect(periodStartDaySchema.parse(1)).toBe(1)
    expect(periodStartDaySchema.parse(28)).toBe(28)
  })

  it.each([0, 29, 31, 1.5])('rejects %s', (value) => {
    expect(periodStartDaySchema.safeParse(value).success).toBe(false)
  })
})

describe('currencyCodeSchema', () => {
  it('lists the supported currencies', () => {
    expect(currencyCodeSchema.options.sort()).toEqual(['EUR', 'GBP', 'TRY', 'USD'])
  })
})
