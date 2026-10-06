/**
 * localStorage for per-device UI preferences only (theme, language, privacy mask).
 * Never store financial data or tokens here. Storage can be unavailable (private mode),
 * so every access is guarded and falls back to defaults.
 */
export function readPreference(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writePreference(key: string, value: string) {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // The preference just won't persist.
  }
}
