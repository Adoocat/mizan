import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enCommon from '../locales/en/common.json'
import trCommon from '../locales/tr/common.json'

export const SUPPORTED_LANGUAGES = ['en', 'tr'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

/** English is the default UI language (decision D2); Turkish is available. */
export const DEFAULT_LANGUAGE: Language = 'en'

const STORAGE_KEY = 'mizan.language'

export const resources = {
  en: { common: enCommon },
  tr: { common: trCommon },
} as const

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

function readStoredLanguage(): Language {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function storeLanguage(language: Language) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, language)
  } catch {
    // Storage can be unavailable (private mode); the choice just won't persist.
  }
}

export async function initI18n(language: Language = readStoredLanguage()) {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      defaultNS: 'common',
      ns: ['common'],
      interpolation: { escapeValue: false }, // React already escapes output
      returnNull: false,
    })
  }
  syncDocumentLanguage(i18n.language)
  i18n.on('languageChanged', syncDocumentLanguage)
  return i18n
}

function syncDocumentLanguage(language: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

export { i18n }
