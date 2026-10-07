import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface StatTile {
  key: string
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  tone?: 'neutral' | 'positive' | 'negative' | 'warning'
}

const TONES = {
  neutral: 'text-ink',
  positive: 'text-positive',
  negative: 'text-negative',
  warning: 'text-warning',
} as const

/**
 * The row of figures under a page title, as every screen in the mockups opens: a quiet label,
 * one number, one line of context.
 */
export function StatTiles({ tiles, className }: { tiles: StatTile[]; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-5 sm:grid-cols-2',
        tiles.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        className,
      )}
    >
      {tiles.map((tile) => (
        <section
          key={tile.key}
          className="flex flex-col gap-2 rounded-card border border-transparent bg-surface p-7"
        >
          <h2 className="m-0 text-label font-normal text-ink-3">{tile.label}</h2>
          <span className={cn('text-value-m', TONES[tile.tone ?? 'neutral'])}>{tile.value}</span>
          {tile.note && <p className="m-0 text-caption text-ink-3">{tile.note}</p>}
        </section>
      ))}
    </div>
  )
}
