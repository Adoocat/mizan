/** Locales Mizan formats numbers for. Matches the UI languages. */
export type NumberLocale = 'en' | 'tr'

export const NUMBER_LOCALES: readonly NumberLocale[] = ['en', 'tr']

export interface Separators {
  readonly group: string
  readonly decimal: string
}

export const SEPARATORS: Record<NumberLocale, Separators> = {
  en: { group: ',', decimal: '.' },
  tr: { group: '.', decimal: ',' },
}

/** Typographic minus (U+2212) used for display, as in the design. Parsing accepts it and '-'. */
export const MINUS_SIGN = '−'
