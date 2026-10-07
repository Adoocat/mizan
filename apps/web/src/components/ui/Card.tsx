import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * A panel: a tonal surface on the canvas. Separation comes from tone, not lines — no border,
 * no shadow. A screen should have 4–6 panels, not 20.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-card border border-transparent bg-surface p-7', className)}
      {...props}
    />
  )
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('m-0 text-panel-title text-ink', className)}>{children}</h2>
}
