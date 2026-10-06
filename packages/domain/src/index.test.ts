import { describe, expect, it } from 'vitest'
import { DOMAIN_VERSION } from './index.ts'

describe('@mizan/domain', () => {
  it('exposes a version', () => {
    expect(DOMAIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
