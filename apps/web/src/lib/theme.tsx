import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { readPreference, writePreference } from './storage'

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

const STORAGE_KEY = 'mizan.theme'

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

export function readThemePreference(): ThemePreference {
  const stored = readPreference(STORAGE_KEY)
  return isThemePreference(stored) ? stored : 'system'
}

/**
 * `system` removes the attribute so CSS follows prefers-color-scheme;
 * `light`/`dark` pin the theme with data-theme on <html>.
 */
export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement
  if (preference === 'system') delete root.dataset.theme
  else root.dataset.theme = preference
}

interface ThemeContextValue {
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setState] = useState<ThemePreference>(readThemePreference)

  const setPreference = useCallback((next: ThemePreference) => {
    applyTheme(next)
    writePreference(STORAGE_KEY, next)
    setState(next)
  }, [])

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference])
  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
