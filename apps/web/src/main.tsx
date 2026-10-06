import './app/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createAppRouter } from './app/router'
import { initI18n } from './lib/i18n'
import { PrivacyProvider } from './lib/privacy'
import { applyTheme, readThemePreference, ThemeProvider } from './lib/theme'

// Apply a pinned theme before the first render. "system" needs no JS (CSS media query).
applyTheme(readThemePreference())

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})
const router = createAppRouter()

await initI18n()

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <PrivacyProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </PrivacyProvider>
    </ThemeProvider>
  </StrictMode>,
)
