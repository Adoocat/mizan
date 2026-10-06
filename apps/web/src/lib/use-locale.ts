import type { NumberLocale } from '@mizan/domain'
import { useTranslation } from 'react-i18next'

/** The number-format locale that matches the current UI language. */
export function useNumberLocale(): NumberLocale {
  const { i18n } = useTranslation()
  return i18n.language === 'tr' ? 'tr' : 'en'
}
