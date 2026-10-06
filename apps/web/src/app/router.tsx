import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { AppShell } from '../components/layout/AppShell'
import { HomePage } from '../features/home/HomePage'
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { ShowcasePage } from '../features/showcase/ShowcasePage'

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: () => <PlaceholderPage page="notFound" phase={0} />,
})

const parent = { getParentRoute: () => rootRoute }

// Pages arrive in the phases noted (docs/PLAN.md §20).
export const routeTree = rootRoute.addChildren([
  createRoute({ ...parent, path: '/', component: HomePage }),
  createRoute({
    ...parent,
    path: '/plan',
    component: () => <PlaceholderPage page="plan" phase={6} />,
  }),
  createRoute({
    ...parent,
    path: '/transactions',
    component: () => <PlaceholderPage page="transactions" phase={5} />,
  }),
  createRoute({
    ...parent,
    path: '/upcoming',
    component: () => <PlaceholderPage page="upcoming" phase={9} />,
  }),
  createRoute({
    ...parent,
    path: '/goals',
    component: () => <PlaceholderPage page="goals" phase={8} />,
  }),
  createRoute({
    ...parent,
    path: '/accounts',
    component: () => <PlaceholderPage page="accounts" phase={4} />,
  }),
  createRoute({ ...parent, path: '/settings', component: SettingsPage }),
  createRoute({ ...parent, path: '/showcase', component: ShowcasePage }),
])

export function createAppRouter() {
  return createRouter({ routeTree, defaultPreload: 'intent' })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
