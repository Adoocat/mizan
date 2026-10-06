import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface MetricCardProps {
  label: ReactNode
  value: ReactNode
  /** Supporting line under the value, e.g. "of ₺9,000 planned". */
  footnote?: ReactNode
  /** `hero` is for the one number that answers the screen's question. */
  size?: 'hero' | 'large' | 'medium' | 'small'
  className?: string
  children?: ReactNode
}

const VALUE_SIZES = {
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
        'flex flex-col gap-2 rounded-card border border-border bg-surface p-5',
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

/** A row of label/value pairs, e.g. Income · Allocated · Left to allocate. */
export function MetricRow({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-1">
          <dt className="text-label text-ink-3">{item.label}</dt>
          <dd className="m-0 text-value-s text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
