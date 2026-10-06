import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HealthIndicator } from './HealthIndicator'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderIndicator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <HealthIndicator />
    </QueryClientProvider>,
  )
}

describe('HealthIndicator', () => {
  it('shows connected when the API is healthy', async () => {
    server.use(
      http.get('*/api/v1/health', () =>
        HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
      ),
    )
    renderIndicator()
    expect(await screen.findByText('Connected')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'ok')
  })

  it('shows degraded when the database is down', async () => {
    server.use(
      http.get('*/api/v1/health', () =>
        HttpResponse.json({ status: 'error', checks: { database: 'error' } }, { status: 503 }),
      ),
    )
    renderIndicator()
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument()
  })

  it('shows offline when the API is unreachable', async () => {
    server.use(http.get('*/api/v1/health', () => HttpResponse.error()))
    renderIndicator()
    expect(await screen.findByText('API unreachable')).toBeInTheDocument()
  })
})
