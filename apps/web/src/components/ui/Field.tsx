import { useId, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/** Shared shell for a labelled control: label above, one message line below (2.0 §06). */
function FieldShell({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label text-ink-2">
        {label}
      </label>
      {children}
      <p
        id={`${id}-message`}
        aria-live="polite"
        className={cn('m-0 min-h-4 text-caption', error ? 'text-negative' : 'text-ink-3')}
      >
        {error ?? hint}
      </p>
    </div>
  )
}

const controlClass =
  'h-10 w-full min-w-0 rounded-control border bg-surface px-3.5 text-body text-ink outline-none transition-colors duration-150 ease-mizan placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:bg-disabled disabled:text-ink-disabled'

const borderClass = (invalid: boolean) =>
  invalid ? 'border-negative' : 'border-border-strong hover:border-border-hover'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: ReactNode
  hint?: ReactNode
  /** Shown instead of the hint, in the negative colour, and sets `aria-invalid`. */
  error?: ReactNode
  className?: string
}

/**
 * Single-line text entry. Amounts use `CurrencyInput` instead — it never produces a float.
 */
export function TextField({ label, hint, error, className, id, ...props }: TextFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} className={className}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-message` : undefined}
        className={cn(controlClass, borderClass(Boolean(error)))}
        {...props}
      />
    </FieldShell>
  )
}

export interface SelectFieldOption {
  value: string
  label: string
}

export interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'className' | 'children'
> {
  label: ReactNode
  options: readonly SelectFieldOption[]
  hint?: ReactNode
  error?: ReactNode
  className?: string
}

export function SelectField({
  label,
  options,
  hint,
  error,
  className,
  id,
  ...props
}: SelectFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} className={className}>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fieldId}-message` : undefined}
        className={cn(controlClass, borderClass(Boolean(error)), 'cursor-pointer appearance-none')}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

/**
 * A form-level message: the one thing that went wrong with the whole submission (wrong password,
 * the server is down). Field-level problems belong on the field.
 */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="m-0 rounded-inset bg-negative-soft px-4 py-3 text-body text-negative"
    >
      {children}
    </p>
  )
}

/** The positive counterpart: "check your email", "saved". */
export function FormNotice({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p
      role="status"
      className="m-0 rounded-inset bg-positive-soft px-4 py-3 text-body text-positive"
    >
      {children}
    </p>
  )
}
