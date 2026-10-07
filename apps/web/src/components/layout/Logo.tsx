import { cn } from '../../lib/cn'

/** The Mizan mark: two balance-scale plates. Decorative; pair with the wordmark or a label. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-[26px] flex-none items-center justify-center rounded-[7px] border border-logo-tile-border bg-logo-tile',
        className,
      )}
    >
      <svg viewBox="0 0 176 186" className="block h-4 w-[15px]">
        <path
          d="M8 6 L68 51 L68 178 L8 136 Z"
          className="fill-logo-left stroke-logo-left"
          strokeWidth="8"
          strokeLinejoin="round"
        />
        <path
          d="M168 6 L168 136 L112 178 L112 106 C112 96 100 92 100 82 L100 54 Z"
          className="fill-logo-right stroke-logo-right"
          strokeWidth="8"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[19px] font-medium tracking-[-0.045em] text-ink">Mizan</span>
    </span>
  )
}
