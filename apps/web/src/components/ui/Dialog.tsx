import * as RadixDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

interface DialogContentProps {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** `sheet` slides up from the bottom on small screens (mobile menus, quick add). */
  variant?: 'modal' | 'sheet'
  className?: string
}

/** Modal dialog with focus trap, Escape to close and a labelled title (Radix). */
export function DialogContent({
  title,
  description,
  children,
  variant = 'modal',
  className,
}: DialogContentProps) {
  const { t } = useTranslation()
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
      <RadixDialog.Content
        className={cn(
          'fixed z-50 flex flex-col gap-4 border border-border-strong bg-surface p-5 shadow-overlay focus:outline-none',
          variant === 'modal' &&
            'top-1/2 left-1/2 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-modal',
          variant === 'sheet' &&
            'inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-modal pb-[max(20px,env(safe-area-inset-bottom))] md:top-1/2 md:bottom-auto md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-modal',
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <RadixDialog.Title className="m-0 text-value-s font-semibold text-ink">
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="m-0 text-body text-ink-2">
                {description}
              </RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            aria-label={t('common.close')}
            className="-mt-1 -mr-1 inline-flex size-8 cursor-pointer items-center justify-center rounded-control text-ink-3 hover:bg-nav-hover hover:text-ink"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}
