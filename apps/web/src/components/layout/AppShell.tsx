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
import { AssistantPanel } from '../../features/assistant/AssistantPanel'
import { Button } from '../ui/Button'
import { Dialog, DialogContent } from '../ui/Dialog'
import { Toaster } from '../ui/Toaster'
import { Logo } from './Logo'
import { LanguageSwitch, PrivacyToggle, ThemeSwitch } from './Preferences'

const navItemClass =
  'group flex h-9 items-center gap-2.5 rounded-control border border-transparent px-3 text-[13.5px] text-ink-nav no-underline transition-colors duration-150 ease-mizan hover:bg-nav-hover hover:text-ink hover:no-underline'
/** 2.0: the active item is a tonal surface — no border, no shadow. */
const navItemActiveClass = '!bg-surface font-medium !text-ink'

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
    <aside className="hidden w-[236px] flex-none flex-col bg-canvas md:flex">
      <div className="flex h-[76px] flex-none items-center px-[22px]">
        {/* 2.0 links the wordmark to the landing page, as the app mockup does. */}
        <Link to="/landing" aria-label={t('nav.landing')} className="no-underline">
          <Logo />
        </Link>
      </div>
      <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto pb-3">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.labelKey ?? index} className="mt-3.5 flex flex-col gap-px px-3">
            {group.labelKey && (
              <p className="m-0 px-2 pt-2 pb-1 text-[11px] font-medium tracking-[0.01em] text-ink-3">
                {t(group.labelKey)}
              </p>
            )}
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
                {item.badge && (
                  // Decorative: the count repeats what the page itself says, and keeping it out
                  // of the accessible name leaves the link called just "Transactions".
                  <span
                    aria-hidden
                    className={cn(
                      'text-caption font-medium',
                      item.badge.tone === 'negative'
                        ? 'text-negative'
                        : item.badge.tone === 'warning'
                          ? 'text-warning'
                          : 'text-ink-3',
                    )}
                  >
                    {item.badge.count}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex flex-none flex-col gap-2.5 px-3 pt-3 pb-4.5">
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
  const [assistantOpen, setAssistantOpen] = useState(false)
  return (
    <div className="flex min-h-dvh bg-canvas md:h-dvh md:overflow-hidden">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('nav.skipToContent')}
      </a>
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="flex h-16 flex-none items-center gap-2.5 bg-canvas px-4 md:h-[76px] md:pr-7 md:pl-10">
          <Link to="/" aria-label={t('nav.homeLink')} className="no-underline md:hidden">
            <Logo />
          </Link>
          <div
            aria-hidden
            className="hidden h-10 max-w-[420px] min-w-[120px] flex-1 items-center gap-2.5 rounded-full bg-surface px-4 text-body text-ink-3 lg:flex"
          >
            <span className="size-[9px] rounded-full border-[1.5px] border-ink-3" />
            {t('nav.search')}
          </div>
          <div className="flex-1 lg:hidden" />
          <PrivacyToggle className="hidden md:inline-flex" />
          <Link
            to="/what-if"
            className="hidden h-10 items-center rounded-full bg-surface px-[18px] text-body whitespace-nowrap text-ink no-underline hover:bg-canvas hover:text-ink lg:flex"
          >
            {t('nav.whatIf')}
          </Link>
          <Button
            variant="secondary"
            onClick={() => setAssistantOpen((open) => !open)}
            aria-pressed={assistantOpen}
            className="hidden lg:inline-flex"
          >
            {t('assistant.ask')}
            <span aria-hidden className="font-mono text-mono text-ink-3">
              ⌘K
            </span>
          </Button>
          <Button variant="primary" className="hidden sm:inline-flex">
            {t('nav.add')}
          </Button>
        </header>
        {/*
         * main is the scroll container, so it carries tabIndex 0: a keyboard user must be able
         * to focus it to scroll it (axe: scrollable-region-focusable), and it is also the skip
         * link's target.
         */}
        <main id="main" tabIndex={0} className="flex-1 pb-24 md:overflow-y-auto md:pb-0">
          {children}
        </main>
      </div>
      {assistantOpen && (
        <div className="hidden py-3 pr-3 lg:flex">
          <AssistantPanel onClose={() => setAssistantOpen(false)} />
        </div>
      )}
      <MobileTabBar />
      <Toaster />
    </div>
  )
}

/**
 * Page title row. 2.0 sets the title as display type (40/300) with an optional eyebrow above
 * it and actions on the right.
 */
export function PageHeader({
  title,
  eyebrow,
  actions,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-2 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="m-0 text-body text-ink-3">{eyebrow}</p>}
        <h1 className="m-0 mt-1.5 text-page-display text-ink">{title}</h1>
      </div>
      {actions}
    </div>
  )
}

/** Standard page padding and max width (2.0 §00: content max 1360, padding 40, gutter 20). */
export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-4 pt-6 pb-8 md:px-10 md:pt-8 md:pb-20">
      {children}
    </div>
  )
}
