import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../components/ui/Skeleton'
import { useSession } from './session'

/** Full-page placeholder while the session is being resolved. */
function SessionPending({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy
      aria-label={label}
      className="flex min-h-dvh flex-col gap-5 bg-canvas p-10"
    >
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-48 w-full rounded-card" />
      <Skeleton className="h-32 w-full rounded-card" />
    </div>
  )
}

/**
 * Gate in front of every signed-in page. The API is the authority — it answers 401 regardless of
 * what the client believes — so this only decides what the browser shows: a placeholder while
 * `/me` is in flight, and a redirect to sign-in (remembering where the user was going) when the
 * answer is "nobody".
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isPending } = useSession()
  const href = useRouterState({ select: (state) => state.location.href })

  /*
   * Where the user was heading, frozen at mount. It must not follow the location: this component
   * is still mounted while the router moves to /sign-in, so a live value would feed the sign-in
   * URL back into its own `redirect` parameter, over and over.
   */
  const [intendedHref] = useState(href)

  const signedOut = !isPending && data === null

  useEffect(() => {
    if (!signedOut) return
    void navigate({ to: '/sign-in', search: { redirect: intendedHref }, replace: true })
  }, [signedOut, navigate, intendedHref])

  if (isPending || signedOut) return <SessionPending label={t('common.loading')} />
  return children
}

/**
 * The mirror image, for the credential screens: someone already signed in has no business on
 * the sign-in form, so send them to the app.
 */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isPending } = useSession()
  const signedIn = Boolean(data)

  useEffect(() => {
    if (!signedIn) return
    void navigate({ to: '/', replace: true })
  }, [signedIn, navigate])

  if (isPending) return <SessionPending label={t('common.loading')} />
  if (signedIn) return null
  return children
}
