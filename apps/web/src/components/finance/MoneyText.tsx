import { formatMoney, type FormatMoneyOptions, type Money } from '@mizan/domain'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { usePrivacy } from '../../lib/privacy'
import { useNumberLocale } from '../../lib/use-locale'

/**
 * How an amount is coloured. Colour describes financial state, never decoration.
 * - `neutral`: ink colour (most amounts)
 * - `signed`: positive green, negative red (income vs spending, gains vs losses)
 * - `overspent`: red when negative (budget lines past their limit)
 */
export type MoneyTone = 'neutral' | 'signed' | 'overspent'

interface MoneyTextProps extends FormatMoneyOptions {
  value: Money
  tone?: MoneyTone
  className?: string
}

export function MoneyText({ value, tone = 'neutral', className, ...format }: MoneyTextProps) {
  const locale = useNumberLocale()
  const { hideAmounts } = usePrivacy()
  const { t } = useTranslation()

  const state = value.isNegative() ? 'negative' : value.isPositive() ? 'positive' : 'zero'
  const color =
    (tone === 'signed' && state === 'positive' && 'text-positive') ||
    (tone !== 'neutral' && state === 'negative' && 'text-negative') ||
    undefined

  if (hideAmounts) {
    return (
      <span className={cn('tabular-nums', className)} aria-label={t('privacy.hiddenAmount')}>
        <span aria-hidden>₺•••••</span>
      </span>
    )
  }

  return (
    <span className={cn('tabular-nums whitespace-nowrap', color, className)} data-sign={state}>
      {formatMoney(value, locale, format)}
    </span>
  )
}
