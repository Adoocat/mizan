import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { AppShell } from '../components/layout/AppShell'
import { AccountDetailPage } from '../features/accounts/AccountDetailPage'
import { AccountsPage } from '../features/accounts/AccountsPage'
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage'
import { RedirectIfSignedIn, RequireSession } from '../features/auth/RequireSession'
import { resetPasswordSearchSchema, signInSearchSchema } from '../features/auth/search'
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage'
import { SignInPage } from '../features/auth/SignInPage'
import { SignUpPage } from '../features/auth/SignUpPage'
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
import { transactionsSearchSchema } from '../features/transactions/search'
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
 * Pathless layout route: every signed-in page renders inside the app shell, behind the session
 * gate. The landing page and the credential screens sit outside it, with their own navigation
 * (design system 2.0 shares the editorial layer between them).
 */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: () => (
    <RequireSession>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireSession>
  ),
})

const parent = { getParentRoute: () => appRoute }

/** Credential screens: no shell, and signed-in visitors are bounced into the app. */
const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: () => (
    <RedirectIfSignedIn>
      <Outlet />
    </RedirectIfSignedIn>
  ),
})

// Pages arrive in the phases noted (docs/PLAN.md §20); until then they read sample data.
export const routeTree = rootRoute.addChildren([
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/landing',
    component: LandingPage,
  }),
  authRoute.addChildren([
    createRoute({
      ...{ getParentRoute: () => authRoute },
      path: '/sign-in',
      component: SignInPage,
      // Where to go after signing in, set by the session gate.
      validateSearch: signInSearchSchema,
    }),
    createRoute({
      ...{ getParentRoute: () => authRoute },
      path: '/sign-up',
      component: SignUpPage,
    }),
    createRoute({
      ...{ getParentRoute: () => authRoute },
      path: '/forgot-password',
      component: ForgotPasswordPage,
    }),
    createRoute({
      ...{ getParentRoute: () => authRoute },
      path: '/reset-password',
      component: ResetPasswordPage,
      // The API's reset callback redirects here with either a token or an error.
      validateSearch: resetPasswordSearchSchema,
    }),
  ]),
  appRoute.addChildren([
    createRoute({ ...parent, path: '/', component: HomePage }),
    createRoute({ ...parent, path: '/plan', component: PlanPage }),
    createRoute({
      ...parent,
      path: '/transactions',
      component: TransactionsPage,
      // The filters live in the URL, so a filtered list can be shared or reloaded (PLAN §13).
      validateSearch: transactionsSearchSchema,
    }),
    createRoute({ ...parent, path: '/calendar', component: CalendarPage }),
    createRoute({ ...parent, path: '/savings', component: SavingsPage }),
    createRoute({ ...parent, path: '/investments', component: InvestmentsPage }),
    createRoute({ ...parent, path: '/debts', component: DebtsPage }),
    createRoute({ ...parent, path: '/net-worth', component: NetWorthPage }),
    createRoute({ ...parent, path: '/reports', component: ReportsPage }),
    createRoute({ ...parent, path: '/what-if', component: WhatIfPage }),
    createRoute({ ...parent, path: '/goals', component: GoalsPage }),
    createRoute({ ...parent, path: '/accounts', component: AccountsPage }),
    createRoute({ ...parent, path: '/accounts/$accountId', component: AccountDetailPage }),
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
