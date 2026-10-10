import type { Money } from '@mizan/domain'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { MoneyText } from './MoneyText'

/** One line of the arithmetic: a label and what it adds or takes away. */
export interface ExplainRow {
  label: ReactNode
  value: Money
  /** Shown with an explicit sign, for a row that is subtracted. */
  negative?: boolean
  /** The line after the rule: the figure the rows add up to. */
  total?: boolean
}

interface ExplainPopoverProps {
  /** What is being explained, e.g. "Safe to spend today". Names the button and the popover. */
  title: string
  rows: readonly ExplainRow[]
  /** Between the rows and the result: "÷ 10 days left". */
  divisor?: ReactNode
  /** The answer, shown last and large. */
  result?: { label: ReactNode; value: Money }
  /** A closing sentence: why the number is what it is. */
  note?: ReactNode
  className?: string
}

/**
 * "How this is calculated" (PLAN §14).
 *
 * **Every calculated number gets one** — a product principle, and the reason the plan's API sends
 * each part of a subtraction rather than only its answer. A figure that can fall because a
 * category went over has to be able to say so, or the app is asking to be trusted without
 * showing its work.
 */
export function ExplainPopover({
  title,
  rows,
  divisor,
  result,
  note,
  className,
}: ExplainPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={t('explain.label', { name: title })}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-surface text-caption text-ink-3 transition-colors duration-150 ease-mizan hover:border-border-hover hover:text-ink"
      >
        <span aria-hidden>?</span>
      </button>

      {open && (
        <>
          {/* Clicking anywhere else closes it. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            id={id}
            role="group"
            aria-label={title}
            className="absolute top-7 left-0 z-50 flex w-[min(20rem,calc(100vw-32px))] flex-col gap-2.5 rounded-card border border-border bg-surface p-5 text-left shadow-overlay"
          >
            <p className="m-0 text-label font-medium text-ink">{t('explain.title')}</p>
            <dl className="m-0 flex flex-col gap-1.5">
              {rows.map((row, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-baseline justify-between gap-3 text-body',
                    row.total && 'border-t border-divider pt-1.5 font-medium',
                  )}
                >
                  <dt className={row.total ? 'text-ink' : 'text-ink-2'}>{row.label}</dt>
                  <dd className="m-0 text-ink">
                    <MoneyText
                      value={row.negative ? row.value.negate() : row.value}
                      fractionDigits="none"
                      {...(row.negative ? { signDisplay: 'always' as const } : {})}
                    />
                  </dd>
                </div>
              ))}
            </dl>
            {divisor && <p className="m-0 text-caption text-ink-3">{divisor}</p>}
            {result && (
              <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-2">
                <span className="text-body text-ink-2">{result.label}</span>
                <span className="text-value-s text-ink">
                  <MoneyText value={result.value} fractionDigits="none" />
                </span>
              </div>
            )}
            {note && <p className="m-0 text-caption text-ink-3">{note}</p>}
          </div>
        </>
      )}
    </span>
  )
}
