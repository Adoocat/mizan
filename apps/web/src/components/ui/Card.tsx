import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Cards are flat: a 1px border and no shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-card border border-border bg-surface p-5', className)} {...props} />
  )
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('m-0 text-card-title text-ink', className)}>{children}</h2>
}
