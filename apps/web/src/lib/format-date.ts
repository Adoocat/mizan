import { addDays, toParts, type PlainDate } from '@mizan/domain'
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

/** The short month name of a date: `Sep`, `Eki`. What the month switcher's arrows are labelled. */
export function useFormatShortMonth() {
  const { t } = useTranslation()
  return (date: PlainDate): string => t(`months.${MONTH_KEYS[toParts(date).month - 1]!}`)
}

/**
 * Names a plan period: `October 2026` for a month that runs from the 1st, and the dates
 * themselves — `15 Oct – 14 Nov 2026` — for one anchored to any other payday (decision D3),
 * where no month's name would be the truth.
 */
export function useFormatPeriod() {
  const { t } = useTranslation()
  const formatDate = useFormatDate()

  return (start: PlainDate, end: PlainDate): string => {
    const from = toParts(start)
    const lastDay = addDays(end, -1)

    if (from.day === 1) {
      return t('dates.monthYear', {
        month: t(`monthsLong.${MONTH_KEYS[from.month - 1]!}`),
        year: from.year,
      })
    }
    return t('dates.range', { from: formatDate(start), to: formatDate(lastDay) })
  }
}
