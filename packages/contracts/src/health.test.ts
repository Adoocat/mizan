import { describe, expect, it } from 'vitest'
import { healthResponseSchema } from './health.ts'

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    const body = { status: 'ok', checks: { database: 'ok' } }
    expect(healthResponseSchema.parse(body)).toEqual(body)
  })

  it('rejects an unknown status', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'up', checks: { database: 'ok' } }).success,
    ).toBe(false)
  })
})
