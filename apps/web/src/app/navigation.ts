/**
 * MVP navigation (PLAN §13, decision D8 / ADR 0004): Savings live in Goals; Debts and
 * Net Worth live in Accounts. Later pages join the nav in the phases that build them.
 */
export const NAV_GROUPS = [
  {
    labelKey: 'nav.groups.daily',
    items: [
      { to: '/', labelKey: 'nav.home' },
      { to: '/plan', labelKey: 'nav.plan' },
      { to: '/transactions', labelKey: 'nav.transactions' },
      { to: '/upcoming', labelKey: 'nav.upcoming' },
    ],
  },
  {
    labelKey: 'nav.groups.wealth',
    items: [
      { to: '/goals', labelKey: 'nav.goals' },
      { to: '/accounts', labelKey: 'nav.accounts' },
    ],
  },
] as const

export type NavPath = (typeof NAV_GROUPS)[number]['items'][number]['to'] | '/settings' | '/showcase'

/** Mobile tab bar from the Mobile mockup: Today · Plan · + · Goals · More. */
export const MOBILE_TABS = [
  { to: '/', labelKey: 'nav.home' },
  { to: '/plan', labelKey: 'nav.plan' },
] as const

export const MOBILE_TABS_AFTER_ADD = [{ to: '/goals', labelKey: 'nav.goals' }] as const

/** Shown in the mobile "More" sheet. */
export const MOBILE_MORE_ITEMS = [
  { to: '/transactions', labelKey: 'nav.transactions' },
  { to: '/upcoming', labelKey: 'nav.upcoming' },
  { to: '/accounts', labelKey: 'nav.accounts' },
  { to: '/settings', labelKey: 'nav.settings' },
] as const
