import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
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

/* ------------------------------------------------------- keys used in the UI */

// Vitest runs from the package root, and `import.meta.url` is not a file URL under jsdom.
const sourceRoot = join(process.cwd(), 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return entry === 'locales' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : []
  })
}

/**
 * Every `t('a.b.c')` written as a literal. Keys built from a variable — `t(\`categories.${key}\`)`
 * — cannot be checked here; those all pass a `defaultValue`, so a miss shows the fallback rather
 * than the key itself.
 */
const LITERAL_KEY = /\bt\(\s*'([A-Za-z][\w.]*)'/g

/** Plural keys are written `used_one` / `used_other` and used as `used`. */
const PLURAL_SUFFIXES = ['_one', '_other', '_zero', '_few', '_many']

function definedKeys(): Set<string> {
  const all = keys(en)
  return new Set([
    ...all,
    ...all.map((key) => {
      const suffix = PLURAL_SUFFIXES.find((candidate) => key.endsWith(candidate))
      return suffix ? key.slice(0, -suffix.length) : key
    }),
  ])
}

describe('every translation key the UI asks for exists', () => {
  it('finds no missing key in English', () => {
    const defined = definedKeys()
    const missing: string[] = []

    for (const file of sourceFiles(sourceRoot)) {
      const source = readFileSync(file, 'utf8')
      for (const [, key] of source.matchAll(LITERAL_KEY)) {
        // A miss renders the key itself on screen, which is how `accounts.archive` once shipped.
        if (!defined.has(key!)) missing.push(`${key!} (${file.slice(sourceRoot.length + 1)})`)
      }
    }

    expect(missing).toEqual([])
  })
})
