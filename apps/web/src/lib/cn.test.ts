import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('keeps a custom font size next to a custom text colour', () => {
    expect(cn('text-caption text-ink-3')).toBe('text-caption text-ink-3')
    expect(cn('text-body', 'text-ink')).toBe('text-body text-ink')
  })

  it('still resolves real conflicts', () => {
    expect(cn('text-caption', 'text-label')).toBe('text-label')
    expect(cn('text-ink', 'text-negative')).toBe('text-negative')
    expect(cn('px-2', false, 'px-3')).toBe('px-3')
  })
})
