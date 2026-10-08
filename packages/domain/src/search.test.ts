import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { matchesSearch, normalizeSearchText, searchTextFrom } from './search.ts'

describe('normalizeSearchText', () => {
  it('folds Turkish casing both ways', () => {
    // The case that drove this: MİGROS.toLowerCase() is "mi̇gros" with a combining dot, and
    // I.toLowerCase() is "i" where Turkish wants "ı". Both have to land on the same string.
    expect(normalizeSearchText('MİGROS')).toBe('migros')
    expect(normalizeSearchText('migros')).toBe('migros')
    expect(normalizeSearchText('Mıgros')).toBe('migros')
    expect(normalizeSearchText('MIGROS')).toBe('migros')
  })

  it('folds the rest of the Turkish alphabet to ASCII', () => {
    expect(normalizeSearchText('Şişli Çarşı Gümüşsuyu')).toBe('sisli carsi gumussuyu')
    expect(normalizeSearchText('İstiklal Caddesi')).toBe('istiklal caddesi')
    expect(normalizeSearchText('ÖĞRENCİ')).toBe('ogrenci')
  })

  it('folds accents from other languages too', () => {
    expect(normalizeSearchText('Café Noël')).toBe('cafe noel')
    expect(normalizeSearchText('Straße')).toBe('strasse')
  })

  it('collapses whitespace and trims', () => {
    expect(normalizeSearchText('  Migros   Kadıköy \n ')).toBe('migros kadikoy')
  })

  it('leaves digits and punctuation alone', () => {
    expect(normalizeSearchText('TAKSİT 3/12 — ₺1.600,00')).toBe('taksit 3/12 — ₺1.600,00')
  })

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const once = normalizeSearchText(value)
        expect(normalizeSearchText(once)).toBe(once)
      }),
    )
  })

  it('never produces leading, trailing or doubled spaces', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const normalized = normalizeSearchText(value)
        expect(normalized).toBe(normalized.trim())
        expect(normalized).not.toContain('  ')
      }),
    )
  })

  it('folds a prefix to a prefix, which is what makes substring search work', () => {
    // The database stores the normalized text and matches a normalized query as a substring, so
    // normalizing may not reorder or interleave characters.
    fc.assert(
      fc.property(fc.string(), fc.string(), (left, right) => {
        const joined = normalizeSearchText(`${left} ${right}`)
        for (const part of [left, right]) {
          const normalized = normalizeSearchText(part)
          if (normalized.length > 0) expect(joined).toContain(normalized)
        }
      }),
    )
  })
})

describe('searchTextFrom', () => {
  it('joins the parts a transaction can be found by', () => {
    expect(searchTextFrom(['Migros Kadıköy', 'Haftalık alışveriş', null, undefined, ''])).toBe(
      'migros kadikoy haftalik alisveris',
    )
  })

  it('is empty when there is nothing to index', () => {
    expect(searchTextFrom([null, undefined, '  '])).toBe('')
  })
})

describe('matchesSearch', () => {
  it('matches across casing and diacritics', () => {
    expect(matchesSearch('MİGROS KADIKÖY', 'kadikoy')).toBe(true)
    expect(matchesSearch('Migros Kadıköy', 'KADIKÖY')).toBe(true)
    expect(matchesSearch('Migros Kadıköy', 'carsi')).toBe(false)
  })

  it('treats an empty query as no filter', () => {
    expect(matchesSearch('anything', '')).toBe(true)
    expect(matchesSearch('anything', '   ')).toBe(true)
  })

  it('finds any text by its own normalization', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (value) => {
        const normalized = normalizeSearchText(value)
        if (normalized.length > 0) expect(matchesSearch(value, normalized)).toBe(true)
      }),
    )
  })
})
