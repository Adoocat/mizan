import { Link, useRouterState } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MOBILE_MORE_ITEMS,
  MOBILE_TABS,
  MOBILE_TABS_AFTER_ADD,
  NAV_GROUPS,
} from '../../app/navigation'
import { cn } from '../../lib/cn'
import { Dialog, DialogContent } from '../ui/Dialog'
import { Toaster } from '../ui/Toaster'
import { Logo } from './Logo'
import { LanguageSwitch, PrivacyToggle, ThemeSwitch } from './Preferences'

const navItemClass =
  'group flex h-[30px] items-center gap-2.5 rounded-control border border-transparent px-2 text-body text-ink-nav no-underline transition-colors hover:bg-nav-hover hover:text-ink hover:no-underline'
const navItemActiveClass =
  '!border-border-strong !bg-surface font-medium !text-ink shadow-[0_1px_1px_rgb(28_27_25/0.04)]'

/** The 5×5 square marking the active item, as in the mockup. */
function ActiveDot() {
  return (
    <span
      aria-hidden
      className="size-[5px] flex-none rounded-[1px] bg-transparent group-aria-[current=page]:bg-accent-strong"
    />
  )
}

function SideNav() {
  const { t } = useTranslation()
  return (
    <aside className="hidden w-[220px] flex-none flex-col border-r border-border-strong bg-canvas md:flex">
      <div className="flex h-14 flex-none items-center px-[18px]">
        <Link to="/" aria-label={t('nav.homeLink')} className="no-underline">
          <Logo />
        </Link>
      </div>
      <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto pb-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="mt-2.5 flex flex-col gap-px px-2.5">
            <p className="m-0 px-2 pt-2 pb-1 text-[11px] font-medium tracking-[0.01em] text-ink-3">
              {t(group.labelKey)}
            </p>
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={navItemClass}
                activeProps={{ className: navItemActiveClass }}
                activeOptions={{ exact: item.to === '/' }}
              >
                <ActiveDot />
                <span className="flex-1">{t(item.labelKey)}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex flex-none flex-col gap-2.5 border-t border-border-strong px-2.5 pt-3 pb-3.5">
        <Link
          to="/settings"
          className={navItemClass}
          activeProps={{ className: navItemActiveClass }}
        >
          <ActiveDot />
          <span className="flex-1">{t('nav.settings')}</span>
        </Link>
        {import.meta.env.DEV && (
          <Link
            to="/showcase"
            className={navItemClass}
            activeProps={{ className: navItemActiveClass }}
          >
            <ActiveDot />
            <span className="flex-1">{t('nav.showcase')}</span>
          </Link>
        )}
        <ThemeSwitch />
        <LanguageSwitch />
      </div>
    </aside>
  )
}

const tabClass =
  'group flex h-12 flex-col items-center justify-center gap-1 text-caption text-ink-3 no-underline hover:no-underline hover:text-ink'
const tabActiveClass = 'font-semibold !text-ink'

function MobileTabBar() {
  const { t } = useTranslation()
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const moreActive = MOBILE_MORE_ITEMS.some((item) => pathname.startsWith(item.to))

  const tab = (item: { to: '/' | '/plan' | '/goals'; labelKey: string }) => (
    <Link
      key={item.to}
      to={item.to}
      className={tabClass}
      activeProps={{ className: tabActiveClass }}
      activeOptions={{ exact: item.to === '/' }}
    >
      <ActiveDot />
      {t(item.labelKey)}
    </Link>
  )

  return (
    <nav
      aria-label={t('nav.tabBar')}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-border bg-tabbar px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
    >
      {MOBILE_TABS.map(tab)}
      <div className="flex justify-center">
        <Link
          to="/transactions"
          aria-label={t('nav.add')}
          className="flex size-11 items-center justify-center rounded-full bg-primary text-[22px] text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary hover:no-underline"
        >
          <span aria-hidden>+</span>
        </Link>
      </div>
      {MOBILE_TABS_AFTER_ADD.map(tab)}
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-current={moreActive ? 'page' : undefined}
          className={cn(tabClass, 'cursor-pointer', moreActive && tabActiveClass)}
        >
          <ActiveDot />
          {t('nav.more')}
        </button>
        <DialogContent title={t('nav.more')} variant="sheet">
          <nav aria-label={t('nav.more')} className="flex flex-col gap-px">
            {MOBILE_MORE_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className={cn(navItemClass, 'h-11 text-[15px]')}
                activeProps={{ className: navItemActiveClass }}
              >
                <ActiveDot />
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-2">
            <ThemeSwitch />
            <LanguageSwitch />
            <PrivacyToggle className="justify-center" />
          </div>
        </DialogContent>
      </Dialog>
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh bg-canvas md:h-dvh md:overflow-hidden">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('nav.skipToContent')}
      </a>
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col bg-page">
        <header className="flex h-14 flex-none items-center gap-2.5 border-b border-border bg-page px-4 md:px-6">
          <Link to="/" aria-label={t('nav.homeLink')} className="no-underline md:hidden">
            <Logo />
          </Link>
          <div className="flex-1" />
          <PrivacyToggle className="hidden md:inline-flex" />
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 pb-24 focus:outline-none md:overflow-y-auto md:pb-0"
        >
          {children}
        </main>
      </div>
      <MobileTabBar />
      <Toaster />
    </div>
  )
}

/** Page title row with optional actions on the right. */
export function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="m-0 flex-1 text-page-title text-ink">{title}</h1>
      {actions}
    </div>
  )
}

/** Standard page padding and max width. */
export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">{children}</div>
}
