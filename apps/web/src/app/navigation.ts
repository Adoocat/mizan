/**
 * Navigation, as `design/new-design/Mizan.dc.html` defines it: four groups, the first unlabelled,
 * with counts on the items that need action.
 *
 * This supersedes the MVP-only nav of ADR 0004: the screens all exist now (ADR 0007), so the
 * sidebar shows them all. The phase tracker still governs when each one gets its real data.
 */
export interface NavItem {
  to: NavPath
  labelKey: string
  /** A count shown on the right, for items waiting on the user. */
  badge?: { count: number; tone: 'neutral' | 'negative' | 'warning' }
}

export const NAV_GROUPS: { labelKey: string | null; items: NavItem[] }[] = [
  {
    labelKey: null,
    items: [
      { to: '/', labelKey: 'nav.home' },
      { to: '/plan', labelKey: 'nav.plan' },
      { to: '/transactions', labelKey: 'nav.transactions', badge: { count: 4, tone: 'neutral' } },
      { to: '/calendar', labelKey: 'nav.calendar', badge: { count: 1, tone: 'negative' } },
    ],
  },
  {
    labelKey: 'nav.groups.wealth',
    items: [
      { to: '/savings', labelKey: 'nav.savings' },
      { to: '/investments', labelKey: 'nav.investments' },
      { to: '/goals', labelKey: 'nav.goals' },
      { to: '/debts', labelKey: 'nav.debts' },
      { to: '/net-worth', labelKey: 'nav.netWorth' },
    ],
  },
  {
    labelKey: 'nav.groups.review',
    items: [
      { to: '/reports', labelKey: 'nav.reports' },
      // No badge: the mockup's count stood for an expired open-banking consent, which the MVP
      // does not build. Accounts reads real data as of phase 4.
      { to: '/accounts', labelKey: 'nav.accounts' },
    ],
  },
  {
    labelKey: 'nav.groups.tools',
    items: [{ to: '/what-if', labelKey: 'nav.whatIf' }],
  },
]

export type NavPath =
  | '/'
  | '/plan'
  | '/transactions'
  | '/calendar'
  | '/savings'
  | '/investments'
  | '/goals'
  | '/debts'
  | '/net-worth'
  | '/reports'
  | '/accounts'
  | '/what-if'
  | '/settings'
  | '/showcase'

/** Mobile tab bar from the Mobile mockup: Today · Plan · + · Goals · More. */
export const MOBILE_TABS = [
  { to: '/' as const, labelKey: 'nav.home' },
  { to: '/plan' as const, labelKey: 'nav.plan' },
]

export const MOBILE_TABS_AFTER_ADD = [{ to: '/goals' as const, labelKey: 'nav.goals' }]

/** Everything else, in the mobile "More" sheet. */
export const MOBILE_MORE_ITEMS: { to: NavPath; labelKey: string }[] = [
  { to: '/transactions', labelKey: 'nav.transactions' },
  { to: '/calendar', labelKey: 'nav.calendar' },
  { to: '/savings', labelKey: 'nav.savings' },
  { to: '/investments', labelKey: 'nav.investments' },
  { to: '/debts', labelKey: 'nav.debts' },
  { to: '/net-worth', labelKey: 'nav.netWorth' },
  { to: '/reports', labelKey: 'nav.reports' },
  { to: '/accounts', labelKey: 'nav.accounts' },
  { to: '/what-if', labelKey: 'nav.whatIf' },
  { to: '/settings', labelKey: 'nav.settings' },
]
