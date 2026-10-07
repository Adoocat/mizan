import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { AppShell } from '../components/layout/AppShell'
import { AccountsPage } from '../features/accounts/AccountsPage'
import { CalendarPage } from '../features/calendar/CalendarPage'
import { DebtsPage } from '../features/debts/DebtsPage'
import { InvestmentsPage } from '../features/investments/InvestmentsPage'
import { NetWorthPage } from '../features/net-worth/NetWorthPage'
import { ReportsPage } from '../features/reports/ReportsPage'
import { SavingsPage } from '../features/savings/SavingsPage'
import { WhatIfPage } from '../features/what-if/WhatIfPage'
import { GoalsPage } from '../features/goals/GoalsPage'
import { HomePage } from '../features/home/HomePage'
import { LandingPage } from '../features/landing/LandingPage'
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage'
import { PlanPage } from '../features/plan/PlanPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { ShowcasePage } from '../features/showcase/ShowcasePage'
import { TransactionsPage } from '../features/transactions/TransactionsPage'

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <AppShell>
      <PlaceholderPage page="notFound" phase={0} />
    </AppShell>
  ),
})

/**
 * Pathless layout route: every signed-in page renders inside the app shell. The landing page
 * sits outside it, with its own navigation (design system 2.0 shares the editorial layer
 * between the two).
 */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})

const parent = { getParentRoute: () => appRoute }

// Pages arrive in the phases noted (docs/PLAN.md §20); until then they read sample data.
export const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/landing',
    component: LandingPage,
  }),
  appRoute.addChildren([
    createRoute({ ...parent, path: '/', component: HomePage }),
    createRoute({ ...parent, path: '/plan', component: PlanPage }),
    createRoute({ ...parent, path: '/transactions', component: TransactionsPage }),
    createRoute({ ...parent, path: '/calendar', component: CalendarPage }),
    createRoute({ ...parent, path: '/savings', component: SavingsPage }),
    createRoute({ ...parent, path: '/investments', component: InvestmentsPage }),
    createRoute({ ...parent, path: '/debts', component: DebtsPage }),
    createRoute({ ...parent, path: '/net-worth', component: NetWorthPage }),
    createRoute({ ...parent, path: '/reports', component: ReportsPage }),
    createRoute({ ...parent, path: '/what-if', component: WhatIfPage }),
    createRoute({ ...parent, path: '/goals', component: GoalsPage }),
    createRoute({ ...parent, path: '/accounts', component: AccountsPage }),
    createRoute({ ...parent, path: '/settings', component: SettingsPage }),
    createRoute({ ...parent, path: '/showcase', component: ShowcasePage }),
  ]),
])

export function createAppRouter() {
  return createRouter({ routeTree, defaultPreload: 'intent' })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
