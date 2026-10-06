import { formatPercent, type Decimal, type FormatPercentOptions } from '@mizan/domain'
import { cn } from '../../lib/cn'
import { useNumberLocale } from '../../lib/use-locale'

interface PercentTextProps extends FormatPercentOptions {
  /** A ratio: 0.125 is 12.5%. */
  value: Decimal
  className?: string
}

export function PercentText({ value, className, ...options }: PercentTextProps) {
  const locale = useNumberLocale()
  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)}>
      {formatPercent(value, locale, options)}
    </span>
  )
}

interface DeltaTextProps {
  /** A change as a ratio: 0.035 is +3.5%. */
  value: Decimal
  fractionDigits?: number
  /** Set when a rise is bad (e.g. spending): colours flip. */
  invert?: boolean
  className?: string
}

/** A signed change with colour: +3.5% green, −2% red (flipped with `invert`). */
export function DeltaText({
  value,
  fractionDigits = 1,
  invert = false,
  className,
}: DeltaTextProps) {
  const locale = useNumberLocale()
  const good = invert ? value.isNegative() : value.isPositive()
  const bad = invert ? value.isPositive() : value.isNegative()
  return (
    <span
      className={cn(
        'tabular-nums whitespace-nowrap',
        !value.isZero() && good && 'text-positive',
        !value.isZero() && bad && 'text-negative',
        className,
      )}
    >
      {formatPercent(value, locale, { fractionDigits, signDisplay: 'always' })}
    </span>
  )
}
