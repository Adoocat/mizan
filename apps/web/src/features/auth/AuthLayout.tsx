import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../../components/layout/Logo'
import { LanguageSwitch, ThemeSwitch } from '../../components/layout/Preferences'

/**
 * The frame around every credential screen. Design system 2.0 has no auth mockup, so this uses
 * the editorial layer the landing page and the app shell share: one canvas tone, a single panel
 * at 24px radius, display type for the heading.
 */
export function AuthLayout({
  title,
  lead,
  children,
  footer,
}: {
  title: ReactNode
  lead?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-16 flex-none items-center justify-between px-4 md:h-[76px] md:px-10">
        <Link to="/landing" aria-label={t('nav.landing')} className="no-underline">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 md:items-center">
        <div className="flex w-full max-w-[420px] flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-page-display text-ink">{title}</h1>
            {lead && <p className="m-0 text-body text-ink-2">{lead}</p>}
          </div>
          <section className="flex flex-col gap-4 rounded-card border border-transparent bg-surface p-7">
            {children}
          </section>
          {footer && <div className="text-body text-ink-2">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

export const authLinkClass = 'font-medium text-accent no-underline hover:underline'
