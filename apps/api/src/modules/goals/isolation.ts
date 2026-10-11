import type { IsolationCase } from '../../testing/isolation.ts'

/**
 * Every `/goals` endpoint, for the cross-tenant suite (PLAN §15).
 *
 * Listing goals takes no identifier — it always resolves the caller's own workspace, like `/me` —
 * so that one is checked only for the session requirement. Everything else carries one of the
 * victim's ids and must answer 404, never 403, which would confirm that the id exists.
 */
export const goalIsolationCases: readonly IsolationCase[] = [
  {
    name: 'GET /goals',
    method: 'GET',
    url: () => '/api/v1/goals',
    crossTenant: false,
  },
  {
    name: 'POST /goals',
    method: 'POST',
    // The account belongs to the victim, so this doubles as a cross-tenant attempt.
    url: () => '/api/v1/goals',
    payload: (ids) => ({
      type: 'savings',
      name: 'Japan trip',
      target: { amount: '35000.00', currency: 'TRY' },
      keptInAccountId: ids.accountId,
    }),
  },
  {
    name: 'GET /goals/:id',
    method: 'GET',
    url: (ids) => `/api/v1/goals/${ids.goalId}`,
  },
  {
    name: 'PATCH /goals/:id',
    method: 'PATCH',
    url: (ids) => `/api/v1/goals/${ids.goalId}`,
    payload: () => ({ name: 'Renamed by someone else' }),
  },
  {
    name: 'POST /goals/:id/archive',
    method: 'POST',
    url: (ids) => `/api/v1/goals/${ids.goalId}/archive`,
  },
  {
    name: 'POST /goals/:id/unarchive',
    method: 'POST',
    url: (ids) => `/api/v1/goals/${ids.goalId}/unarchive`,
  },
  {
    name: 'POST /goals/:id/contributions',
    method: 'POST',
    url: (ids) => `/api/v1/goals/${ids.goalId}/contributions`,
    payload: () => ({ amount: { amount: '1000.00', currency: 'TRY' } }),
  },
  {
    name: 'DELETE /goals/:id/contributions/:contributionId',
    method: 'DELETE',
    url: (ids) => `/api/v1/goals/${ids.goalId}/contributions/${ids.goalContributionId}`,
  },
  {
    name: 'POST /goals/:id/plan-line',
    method: 'POST',
    url: (ids) => `/api/v1/goals/${ids.goalId}/plan-line`,
    payload: () => ({ planned: { amount: '3000.00', currency: 'TRY' } }),
  },
]
