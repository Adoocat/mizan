import {
  formatMoney,
  getCurrency,
  Money,
  parseMoneyInput,
  type NumberLocale,
  type ParseError,
} from '@mizan/domain'
import { useId, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useNumberLocale } from '../../lib/use-locale'

export type CurrencyInputError = ParseError | 'negative'

type Parsed = { ok: true; value: Money } | { ok: false; error: CurrencyInputError }

interface CurrencyInputProps {
  label: string
  value: Money | null
  /** Called on every keystroke with the parsed amount, or null when empty or invalid. */
  onChange: (value: Money | null) => void
  currency?: string
  allowNegative?: boolean
  required?: boolean
  name?: string
  id?: string
  hint?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

const OPERATOR_BETWEEN_DIGITS = /\d\s*[+\-−]\s*[\d.,]/

function parseAmount(
  text: string,
  currency: string,
  locale: NumberLocale,
  allowNegative: boolean,
): Parsed {
  const result = parseMoneyInput(text, currency, locale)
  if (result.ok && result.value.isNegative() && !allowNegative) {
    return { ok: false, error: 'negative' }
  }
  return result
}

const sameAmount = (a: Money | null, b: Money | null) =>
  a === b || (a !== null && b !== null && a.equals(b))

/**
 * Amount entry that never produces a float. Accepts `50.000,50`, `50,000.50` and sums like
 * `1200+350` (showing the result while typing). Normalizes the text on blur and shows errors
 * only after the user has left the field.
 */
export function CurrencyInput({
  label,
  value,
  onChange,
  currency = 'TRY',
  allowNegative = false,
  required = false,
  name,
  id,
  hint,
  disabled,
  autoFocus,
  className,
}: CurrencyInputProps) {
  const { t } = useTranslation()
  const locale = useNumberLocale()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const messageId = `${inputId}-message`
  const info = getCurrency(currency)

  const display = (money: Money | null) =>
    money ? formatMoney(money, locale, { currencyDisplay: 'none' }) : ''

  const [text, setText] = useState(() => display(value))
  const [touched, setTouched] = useState(false)
  const [lastValue, setLastValue] = useState(value)

  // Adopt values set from outside (form reset, programmatic changes) without
  // reformatting what the user is typing when the amount is the same.
  if (!sameAmount(value, lastValue)) {
    setLastValue(value)
    setText(display(value))
  }

  const parsed = parseAmount(text, info.code, locale, allowNegative)
  const error: CurrencyInputError | null =
    parsed.ok || (parsed.error === 'empty' && !required) ? null : parsed.error
  const showError = touched && error !== null
  const preview = parsed.ok && OPERATOR_BETWEEN_DIGITS.test(text) ? parsed.value : null
  const message = showError
    ? t(`currencyInput.errors.${error}`, { decimals: info.minorUnits })
    : preview
      ? `= ${formatMoney(preview, locale)}`
      : hint

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    const result = parseAmount(next, info.code, locale, allowNegative)
    const nextValue = result.ok ? result.value : null
    setText(next)
    setLastValue(nextValue)
    onChange(nextValue)
  }

  function handleBlur() {
    setTouched(true)
    if (parsed.ok) setText(display(parsed.value))
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-label text-ink-2">
        {label}
      </label>
      <div
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-control border bg-surface px-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
          showError ? 'border-negative' : 'border-border-strong hover:border-border-hover',
          disabled && 'bg-disabled',
        )}
      >
        <span aria-hidden className="text-ink-3">
          {info.symbol}
        </span>
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          required={required}
          value={text}
          placeholder={display(Money.zero(info.code))}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={showError || undefined}
          aria-describedby={message ? messageId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-right text-value-s tabular-nums text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <p
        id={messageId}
        aria-live="polite"
        className={cn('m-0 min-h-4 text-caption', showError ? 'text-negative' : 'text-ink-3')}
      >
        {message}
      </p>
    </div>
  )
}
