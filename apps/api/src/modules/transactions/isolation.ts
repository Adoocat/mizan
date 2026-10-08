import type { IsolationCase } from '../../testing/isolation.ts'

/**
 * Every `/transactions` endpoint, for the cross-tenant suite. The ids all belong to the
 * *victim's* workspace, so a 404 is the only acceptable answer to each of them.
 */
export const transactionIsolationCases: readonly IsolationCase[] = [
  {
    name: 'GET /transactions',
    method: 'GET',
    url: () => '/api/v1/transactions',
    crossTenant: false,
  },
  {
    name: 'POST /transactions',
    method: 'POST',
    url: () => '/api/v1/transactions',
    // Every id here is the victim's: the account and the category must both be refused.
    payload: (ids) => ({
      type: 'expense',
      date: '2026-10-22',
      accountId: ids.accountId,
      parts: [{ categoryId: ids.categoryId, amount: { amount: '85.00', currency: 'TRY' } }],
    }),
  },
  {
    name: 'GET /transactions/:id',
    method: 'GET',
    url: (ids) => `/api/v1/transactions/${ids.transactionId}`,
  },
  {
    name: 'PUT /transactions/:id',
    method: 'PUT',
    url: (ids) => `/api/v1/transactions/${ids.transactionId}`,
    payload: (ids) => ({
      type: 'expense',
      date: '2026-10-22',
      accountId: ids.accountId,
      parts: [{ amount: { amount: '1.00', currency: 'TRY' } }],
    }),
  },
  {
    name: 'DELETE /transactions/:id',
    method: 'DELETE',
    url: (ids) => `/api/v1/transactions/${ids.transactionId}`,
  },
  {
    name: 'POST /transactions/:id/restore',
    method: 'POST',
    url: (ids) => `/api/v1/transactions/${ids.transactionId}/restore`,
  },
]
