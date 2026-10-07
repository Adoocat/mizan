import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { authClient } from '../../lib/auth-client'
import { clearSession, useSession } from './session'

/** Falls back to initials of the email when the name is a single word. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).slice(0, 2)
  return (
    words
      .map((word) => word[0] ?? '')
      .join('')
      .toUpperCase() || '?'
  )
}

/**
 * Who is signed in, and the way out. Sits at the bottom of the side nav and inside the mobile
 * "More" sheet.
 */
export function AccountFooter() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data } = useSession()
  const [signingOut, setSigningOut] = useState(false)

  if (!data) return null

  async function signOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
    } finally {
      // Every cached query belongs to the session that is ending.
      clearSession(queryClient)
      await navigate({ to: '/sign-in', replace: true })
    }
  }

  return (
    <div className="flex items-center gap-2.5 px-3 pt-1">
      <span
        aria-hidden
        className="flex size-8 flex-none items-center justify-center rounded-full bg-surface text-caption font-medium text-ink-2"
      >
        {initials(data.user.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body text-ink">{data.user.name}</span>
        <span className="truncate text-caption text-ink-3">{data.workspace.name}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        loading={signingOut}
        onClick={() => void signOut()}
        className="flex-none"
      >
        {t('auth.signOut')}
      </Button>
    </div>
  )
}
