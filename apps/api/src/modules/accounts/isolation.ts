import type { IsolationCase } from '../../testing/isolation.ts'

/**
 * Every `/accounts` endpoint, for the cross-tenant suite. `accountId` is an account that belongs
 * to the *victim's* workspace; the attacker must get 404 from all of them — not 403, which would
 * confirm the id exists.
 */
export const accountIsolationCases: readonly IsolationCase[] = [
  { name: 'GET /accounts', method: 'GET', url: () => '/api/v1/accounts', crossTenant: false },
  {
    name: 'POST /accounts',
    method: 'POST',
    url: () => '/api/v1/accounts',
    payload: () => ({ name: 'Intruder account', type: 'cash' }),
    crossTenant: false,
  },
  {
    name: 'GET /accounts/:id',
    method: 'GET',
    url: (ids) => `/api/v1/accounts/${ids.accountId}`,
  },
  {
    name: 'PATCH /accounts/:id',
    method: 'PATCH',
    url: (ids) => `/api/v1/accounts/${ids.accountId}`,
    payload: () => ({ name: 'Renamed by someone else' }),
  },
  {
    name: 'POST /accounts/:id/archive',
    method: 'POST',
    url: (ids) => `/api/v1/accounts/${ids.accountId}/archive`,
  },
  {
    name: 'POST /accounts/:id/unarchive',
    method: 'POST',
    url: (ids) => `/api/v1/accounts/${ids.accountId}/unarchive`,
  },
  {
    name: 'POST /accounts/:id/reconcile',
    method: 'POST',
    url: (ids) => `/api/v1/accounts/${ids.accountId}/reconcile`,
    payload: () => ({ statementBalance: { amount: '999999.00', currency: 'TRY' } }),
  },
]
