import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { HomePage } from '../features/home/HomePage'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

export const routeTree = rootRoute.addChildren([indexRoute])

export function createAppRouter() {
  return createRouter({ routeTree, defaultPreload: 'intent' })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
