import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, type RenderOptions } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactElement, ReactNode } from 'react'
import { routeTree } from '../app/router'
import { i18n, type Language } from '../lib/i18n'
import { PrivacyProvider } from '../lib/privacy'
import { ThemeProvider } from '../lib/theme'

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <ThemeProvider>
      <PrivacyProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </PrivacyProvider>
    </ThemeProvider>
  )
}

export async function setLanguage(language: Language) {
  await i18n.changeLanguage(language)
}

export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: Providers, ...options })
}

/** Renders the whole app (shell + routes) at a path. */
export function renderApp(path = '/') {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const result = renderWithProviders(<RouterProvider router={router} />)
  return { ...result, router }
}

/**
 * Runs axe on rendered output. Colour contrast can't be computed in jsdom; the Playwright
 * a11y test checks it in a real browser in both themes.
 */
export async function axeViolations(container: Element) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  })
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)
}
