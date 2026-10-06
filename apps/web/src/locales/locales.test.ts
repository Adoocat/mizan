import { describe, expect, it } from 'vitest'
import en from './en/common.json'
import tr from './tr/common.json'

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function placeholders(value: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string')
      out[path] = [...node.matchAll(/{{(\w+)}}/g)].map((m) => m[1]!).sort()
    else if (typeof node === 'object' && node !== null)
      for (const [key, child] of Object.entries(node)) walk(child, path ? `${path}.${key}` : key)
  }
  walk(value, '')
  return out
}

describe('translations', () => {
  it('English and Turkish have the same keys', () => {
    expect(keys(tr).sort()).toEqual(keys(en).sort())
  })

  it('use the same interpolation placeholders', () => {
    expect(placeholders(tr)).toEqual(placeholders(en))
  })
})
