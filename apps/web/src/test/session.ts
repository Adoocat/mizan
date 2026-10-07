import type { MeResponse } from '@mizan/contracts'
import { http, HttpResponse } from 'msw'

/** The signed-in user every component test renders behind. */
export const TEST_SESSION: MeResponse = {
  user: {
    id: '019a2c1e-0000-7000-8000-000000000001',
    name: 'Elif Demir',
    email: 'elif@example.test',
    emailVerified: false,
    locale: 'en',
    timezone: 'Europe/Istanbul',
  },
  workspace: {
    id: '019a2c1e-0000-7000-8000-000000000002',
    name: 'Personal',
    baseCurrency: 'TRY',
    periodStartDay: 1,
    timezone: 'Europe/Istanbul',
    role: 'owner',
  },
}

/**
 * MSW handlers for `GET /api/v1/me`, the one call the session gate makes. Pass `null` for a
 * signed-out browser (the API answers 401).
 */
export function sessionHandlers(session: MeResponse | null = TEST_SESSION) {
  return [
    http.get('*/api/v1/me', () =>
      session
        ? HttpResponse.json(session)
        : HttpResponse.json(
            { type: 'about:blank', title: 'Unauthorized', status: 401 },
            { status: 401 },
          ),
    ),
  ]
}
