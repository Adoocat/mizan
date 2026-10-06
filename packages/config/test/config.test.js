import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))

describe('shared tsconfig', () => {
  it('keeps strict type checking on', () => {
    const { compilerOptions } = read('tsconfig.base.json')
    expect(compilerOptions.strict).toBe(true)
    expect(compilerOptions.noUncheckedIndexedAccess).toBe(true)
  })

  it('web config extends the base config', () => {
    expect(read('tsconfig.web.json').extends).toBe('./tsconfig.base.json')
  })
})
