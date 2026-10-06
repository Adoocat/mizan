import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-primary bg-primary text-on-primary font-medium hover:bg-primary-hover',
  secondary: 'border-border-strong bg-surface text-ink hover:border-border-hover hover:bg-canvas',
  ghost: 'border-transparent bg-transparent text-ink-nav hover:bg-nav-hover hover:text-ink',
  danger: 'border-danger bg-danger text-white font-medium hover:opacity-90',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control border text-body whitespace-nowrap transition-colors',
        size === 'md' ? 'h-8 px-3.5' : 'h-7 px-2.5 text-label',
        VARIANTS[variant],
        'disabled:cursor-not-allowed disabled:border-border-strong disabled:bg-disabled disabled:text-ink-disabled disabled:opacity-100',
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  )
}
