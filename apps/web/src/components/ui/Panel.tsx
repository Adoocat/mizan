import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface PanelProps {
  title?: ReactNode
  /** Secondary line after the title, e.g. "6 payments · 23–29 Oct". */
  meta?: ReactNode
  /** Right-hand control: a link to the full page, a filter, a badge. */
  action?: ReactNode
  /** Drops the panel's own padding, for tables and lists that bleed to the edge. */
  flush?: boolean
  className?: string
  children: ReactNode
}

/**
 * A titled panel. The same tonal surface as `Card`, with the mockups' header row:
 * title at 15/500, meta in ink 2, one action on the right.
 *
 * A titled panel is pointed at its own heading, which is what makes the `<section>` a landmark
 * a screen reader can list and jump between. Without a name a `<section>` is just a `<div>`.
 */
export function Panel({ title, meta, action, flush = false, className, children }: PanelProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-5 rounded-card border border-transparent bg-surface',
        flush ? 'py-6' : 'p-7',
        className,
      )}
    >
      {(title || action) && (
        <div className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-1', flush && 'px-7')}>
          {title && (
            <h2 id={titleId} className="m-0 text-panel-title text-ink">
              {title}
            </h2>
          )}
          {meta && <span className="text-caption text-ink-3">{meta}</span>}
          {action && <div className="ml-auto flex items-center gap-3">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** The quiet "Open plan" / "All transactions" link in a panel header (pair with `<Link>`). */
export const panelLinkClass = 'text-body font-medium text-accent no-underline hover:underline'
