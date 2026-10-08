import { describe, expect, it } from 'vitest'
import {
  CATEGORY_GROUP_KINDS,
  categoryGroupKind,
  categoryTemplateSystemKeys,
  compareCategoryGroupKinds,
  DEFAULT_CATEGORY_TEMPLATE,
  isCategoryGroupKind,
  isEssentialCategory,
  isPooledByDefault,
  isSpendingKind,
  MAX_CATEGORY_DEPTH,
  UnknownCategoryGroupKindError,
  type CategoryGroupKind,
} from './categories.ts'

describe('category group kinds', () => {
  it('recognizes the six kinds and nothing else', () => {
    for (const kind of CATEGORY_GROUP_KINDS) expect(isCategoryGroupKind(kind)).toBe(true)
    for (const other of ['pool', 'Essential', '', 42, null, undefined]) {
      expect(isCategoryGroupKind(other)).toBe(false)
    }
  })

  it('parses a known kind and refuses an unknown one', () => {
    expect(categoryGroupKind('flexible')).toBe('flexible')
    expect(() => categoryGroupKind('pool')).toThrow(UnknownCategoryGroupKindError)
  })

  it('treats everything but income as spending', () => {
    expect(isSpendingKind('income')).toBe(false)
    for (const kind of CATEGORY_GROUP_KINDS.filter((k) => k !== 'income')) {
      expect(isSpendingKind(kind)).toBe(true)
    }
  })

  it('pools flexible spending only', () => {
    expect(isPooledByDefault('flexible')).toBe(true)
    for (const kind of CATEGORY_GROUP_KINDS.filter((k) => k !== 'flexible')) {
      expect(isPooledByDefault(kind)).toBe(false)
    }
  })

  it('counts only essential categories towards essential monthly expenses', () => {
    expect(isEssentialCategory('essential')).toBe(true)
    expect(isEssentialCategory('debt')).toBe(false)
    expect(isEssentialCategory('flexible')).toBe(false)
  })

  it('orders the kinds the way the Plan page stacks them', () => {
    const shuffled: CategoryGroupKind[] = ['investment', 'essential', 'income', 'flexible']
    expect([...shuffled].sort(compareCategoryGroupKinds)).toEqual([
      'income',
      'essential',
      'flexible',
      'investment',
    ])
  })

  it('allows two levels of category', () => {
    expect(MAX_CATEGORY_DEPTH).toBe(2)
  })
})

describe('the default template', () => {
  it('has a group for every kind, in order', () => {
    expect(DEFAULT_CATEGORY_TEMPLATE.map((group) => group.kind)).toEqual([
      'income',
      'essential',
      'flexible',
      'debt',
      'savings',
      'investment',
    ])
  })

  it('gives every group at least one category', () => {
    for (const group of DEFAULT_CATEGORY_TEMPLATE) {
      expect(group.categories.length, group.systemKey).toBeGreaterThan(0)
    }
  })

  it('uses each system key once, so the per-workspace unique index holds', () => {
    const keys = categoryTemplateSystemKeys()
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('numbers sort orders from one inside every group', () => {
    const orders = (entries: readonly { sortOrder: number }[]) =>
      entries.map((entry) => entry.sortOrder)
    const sequence = (length: number) => Array.from({ length }, (_, index) => index + 1)

    expect(orders(DEFAULT_CATEGORY_TEMPLATE)).toEqual(sequence(DEFAULT_CATEGORY_TEMPLATE.length))
    for (const group of DEFAULT_CATEGORY_TEMPLATE) {
      expect(orders(group.categories), group.systemKey).toEqual(sequence(group.categories.length))
    }
  })

  it('can cover the transfer out of an on-budget account', () => {
    // §10: an on-budget → off-budget transfer needs a category on the on-budget line, so the
    // template has to ship one for savings and one for investments.
    const kinds = DEFAULT_CATEGORY_TEMPLATE.filter((group) => group.categories.length > 0).map(
      (group) => group.kind,
    )
    expect(kinds).toContain('savings')
    expect(kinds).toContain('investment')
  })
})
