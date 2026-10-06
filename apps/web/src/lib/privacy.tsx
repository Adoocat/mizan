import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { readPreference, writePreference } from './storage'

const STORAGE_KEY = 'mizan.hideAmounts'

interface PrivacyContextValue {
  /** When true, MoneyText masks amounts (for using the app in public). */
  hideAmounts: boolean
  setHideAmounts: (hide: boolean) => void
}

const PrivacyContext = createContext<PrivacyContextValue>({
  hideAmounts: false,
  setHideAmounts: () => {},
})

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hideAmounts, setState] = useState(() => readPreference(STORAGE_KEY) === 'true')

  const setHideAmounts = useCallback((hide: boolean) => {
    writePreference(STORAGE_KEY, String(hide))
    setState(hide)
  }, [])

  const value = useMemo(() => ({ hideAmounts, setHideAmounts }), [hideAmounts, setHideAmounts])
  return <PrivacyContext value={value}>{children}</PrivacyContext>
}

export function usePrivacy(): PrivacyContextValue {
  return useContext(PrivacyContext)
}
