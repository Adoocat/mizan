import { cn } from '../../lib/cn'

/** Loading placeholder. Hidden from assistive tech; pair it with an aria-busy region. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-bar bg-track', className)} />
}
