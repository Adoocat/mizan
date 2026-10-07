import { Toaster as SonnerToaster, toast } from 'sonner'
import { useTheme } from '../../lib/theme'

/** Mounted once in the app shell. Toasts are announced to screen readers by Sonner. */
export function Toaster() {
  const { preference } = useTheme()
  return (
    <SonnerToaster
      theme={preference}
      position="bottom-center"
      offset={88}
      mobileOffset={96}
      toastOptions={{
        classNames: {
          toast:
            '!bg-tip !text-tip-ink !border-transparent !rounded-inset !shadow-raised !font-sans !text-body',
          actionButton: '!bg-transparent !text-accent !font-medium',
        },
      }}
    />
  )
}

/** A toast with an Undo action, e.g. after deleting a transaction. */
export function toastWithUndo(message: string, undoLabel: string, onUndo: () => void) {
  toast(message, { action: { label: undoLabel, onClick: onUndo }, duration: 6000 })
}

export { toast }
