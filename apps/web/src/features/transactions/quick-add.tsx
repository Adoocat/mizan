import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useSession } from '../auth/session'
import { TransactionFormDialog } from './TransactionFormDialog'

interface QuickAdd {
  open: () => void
}

const QuickAddContext = createContext<QuickAdd | null>(null)

/**
 * Quick add, reachable from anywhere in the shell: the header's "Add transaction" and the phone
 * tab bar's **+** both open the same form (flow F4 — recording an expense is the thing people do
 * most, so it must never be more than one tap away).
 *
 * The dialog is mounted only while it is open. The app shell also wraps the not-found page, which
 * renders outside the session gate, and the form needs a workspace to read its base currency and
 * accounts from.
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)

  const value = useMemo<QuickAdd>(() => ({ open: () => setOpen(true) }), [])

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      {session && open && <TransactionFormDialog open onOpenChange={setOpen} />}
    </QuickAddContext.Provider>
  )
}

/** Opens quick add. Returns null outside the provider, so a button can hide itself. */
export function useQuickAdd(): QuickAdd | null {
  return useContext(QuickAddContext)
}
