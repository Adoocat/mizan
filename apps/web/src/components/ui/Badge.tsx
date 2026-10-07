import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'negative' | 'estimated'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-ink-2 border-canvas',
  accent: 'bg-accent-soft text-accent border-accent-soft',
  positive: 'bg-positive-soft text-positive border-positive-soft',
  warning: 'bg-warning-soft text-warning border-warning-soft',
  negative: 'bg-negative-soft text-negative border-negative-soft',
  estimated: 'bg-surface text-ink-2 border-dashed border-ink-3',
}

/** Status label: Paid, Upcoming, Overdue, On track… Colour always describes state. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center self-start rounded-full border px-2.5 text-caption font-medium whitespace-nowrap',
        TONES[tone],
      )}
    >
      {children}
    </span>
  )
}
