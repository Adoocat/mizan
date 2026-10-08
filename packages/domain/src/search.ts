/**
 * Text normalization for search (PLAN §7, §21).
 *
 * Turkish casing is the whole reason this exists. `MİGROS` and `migros` are the same shop, but
 * `MİGROS`.toLowerCase() is `mi̇gros` in JavaScript — an `i` with a combining dot — and
 * `I`.toLowerCase() is `i` where Turkish wants `ı`. Searching for "migros" has to find all of
 * them, so instead of casing the two languages differently, everything is folded to plain ASCII
 * letters: `ı`, `İ`, `î` and `i` all become `i`, `ş` becomes `s`, `ğ` becomes `g`.
 *
 * This is also the normalization the database stores. A transaction's `search_text` column holds
 * the output of `normalizeSearchText` over its payee, notes and memos, so a query normalized the
 * same way is a plain substring match against a trigram index — and the rule lives here, once,
 * rather than being written a second time in SQL where it could drift.
 */

/**
 * Letters that survive NFD with no combining mark to strip, or that fold to something other than
 * their base letter. Turkish dotless `ı` and the German `ß` are the ones that matter here.
 */
const FOLDED: Record<string, string> = {
  ı: 'i',
  I: 'i',
  ß: 'ss',
  æ: 'ae',
  Æ: 'ae',
  œ: 'oe',
  Œ: 'oe',
  ø: 'o',
  Ø: 'o',
  đ: 'd',
  Đ: 'd',
  ł: 'l',
  Ł: 'l',
}

const COMBINING_MARKS = /[̀-ͯ]/g
const FOLDABLE = /[ıIßæÆœŒøØđĐłŁ]/g
const WHITESPACE = /\s+/g

/**
 * Folds text to the form search compares: ASCII letters, lower case, single spaces, trimmed.
 *
 * `İstiklal Caddesi` and `ISTIKLAL CADDESI` both become `istiklal caddesi`. Decomposition does
 * most of the work (`ş` → `s` + cedilla → `s`); `FOLDED` covers the letters that decomposition
 * leaves alone.
 */
export function normalizeSearchText(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      // `FOLDABLE` is built from the keys of `FOLDED`, so the lookup always finds one.
      .replace(FOLDABLE, (letter) => FOLDED[letter]!)
      .toLowerCase()
      .replace(WHITESPACE, ' ')
      .trim()
  )
}

/** Joins the parts of a transaction into the single string its `search_text` column holds. */
export function searchTextFrom(parts: readonly (string | null | undefined)[]): string {
  return normalizeSearchText(parts.filter((part): part is string => Boolean(part)).join(' '))
}

/**
 * Whether a haystack matches a query, with both sides folded. An empty query matches everything,
 * which is what an empty search box should do.
 */
export function matchesSearch(haystack: string, query: string): boolean {
  const needle = normalizeSearchText(query)
  return needle.length === 0 || normalizeSearchText(haystack).includes(needle)
}
