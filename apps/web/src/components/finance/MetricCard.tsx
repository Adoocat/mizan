import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface MetricCardProps {
  label: ReactNode
  value: ReactNode
  /** Supporting line under the value, e.g. "of ₺9,000 planned". */
  footnote?: ReactNode
  /** `display` is the hero figure of a hero panel; `hero` is the 52px figure of §02. */
  size?: 'display' | 'hero' | 'large' | 'medium' | 'small'
  className?: string
  children?: ReactNode
}

const VALUE_SIZES = {
  display: 'text-display-figure',
  hero: 'text-hero',
  large: 'text-value-l',
  medium: 'text-value-m',
  small: 'text-value-s',
} as const

export function MetricCard({
  label,
  value,
  footnote,
  size = 'medium',
  className,
  children,
}: MetricCardProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-2 rounded-card border border-transparent bg-surface p-7',
        className,
      )}
    >
      <h3 className="m-0 text-label font-normal text-ink-3">{label}</h3>
      <div className={cn('text-ink', VALUE_SIZES[size])}>{value}</div>
      {footnote && <p className="m-0 text-caption text-ink-2">{footnote}</p>}
      {children}
    </section>
  )
}

/**
 * The one panel that answers the screen's question: a 32px frame, the hero figure and a faint
 * teal glow at 10% (2.0 §00 — never behind numbers or charts, so it sits top-right of the text).
 */
export function HeroPanel({
  label,
  value,
  footnote,
  aside,
  children,
}: {
  label: ReactNode
  value: ReactNode
  footnote?: ReactNode
  /** The supporting half of the panel, e.g. this month's plan. */
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="relative flex flex-wrap gap-8 overflow-hidden rounded-frame bg-surface p-7 md:gap-16 md:p-[clamp(28px,3.4vw,48px)]">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-60%] right-[-12%] aspect-square w-3/5 rounded-full opacity-10 [background:radial-gradient(closest-side,var(--m-accent-strong),transparent)]"
      />
      <div className="relative flex min-w-0 flex-1 basis-80 flex-col gap-5">
        <h2 className="m-0 flex items-center gap-2 text-[14px] font-normal text-ink-2">{label}</h2>
        <div className="flex flex-col gap-2.5">
          <span className="text-display-figure text-ink">{value}</span>
          {footnote && <span className="text-lead text-ink-2">{footnote}</span>}
        </div>
        {children}
      </div>
      {aside && (
        <div className="relative flex min-w-0 flex-[1.35] basis-[26rem] flex-col justify-center gap-6">
          {aside}
        </div>
      )}
    </section>
  )
}

/** A row of label/value pairs, e.g. Income · Allocated · Left to allocate. */
export function MetricRow({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-5">
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-1">
          <dt className="text-label text-ink-3">{item.label}</dt>
          <dd className="m-0 text-value-s text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
