import { toParts, type PlainDate } from '@mizan/domain'
import { useTranslation } from 'react-i18next'

const MONTH_KEYS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

/**
 * Formats a business date the way each language writes one: `7 Oct 2026`, `7 Eki 2026`.
 *
 * Built from the translated month names rather than `Intl.DateTimeFormat`, for the same reason
 * the money formatter is hand-rolled: identical output in every engine, and no `Date` in the path,
 * so a `YYYY-MM-DD` can never shift a day across time zones.
 */
export function useFormatDate() {
  const { t } = useTranslation()
  return (date: PlainDate): string => {
    const { year, month, day } = toParts(date)
    return t('dates.dayMonthYear', {
      day,
      month: t(`months.${MONTH_KEYS[month - 1]!}`),
      year,
    })
  }
}
