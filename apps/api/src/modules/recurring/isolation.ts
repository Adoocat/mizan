import type { IsolationCase } from '../../testing/isolation.ts'

/** The date of the victim's fixture rule's first occurrence, which the occurrence cases address. */
export const RECURRING_ISOLATION_DATE = '2026-10-01'

/**
 * Every `/recurring` and `/upcoming` endpoint, for the cross-tenant suite (PLAN §15).
 *
 * `GET /recurring` and `/upcoming` take no identifier — they always resolve the caller's own
 * workspace, like `/me` — so those are checked only for the session requirement. Everything else
 * carries one of the victim's ids and must answer 404, never 403: a 403 would confirm that the id
 * exists, and the dates in these URLs would then say when somebody else's rent falls due.
 */
export const recurringIsolationCases: readonly IsolationCase[] = [
  {
    name: 'GET /recurring',
    method: 'GET',
    url: () => '/api/v1/recurring',
    crossTenant: false,
  },
  {
    name: 'GET /upcoming',
    method: 'GET',
    url: () => '/api/v1/upcoming?days=7',
    crossTenant: false,
  },
  {
    name: 'POST /recurring',
    method: 'POST',
    // The account and category belong to the victim, so this doubles as a cross-tenant attempt.
    url: () => '/api/v1/recurring',
    payload: (ids) => ({
      kind: 'expense',
      name: 'Rent',
      amount: { amount: '11500.00', currency: 'TRY' },
      freq: 'monthly',
      startDate: RECURRING_ISOLATION_DATE,
      accountId: ids.accountId,
      categoryId: ids.categoryId,
    }),
  },
  {
    name: 'GET /recurring/:id/occurrences',
    method: 'GET',
    url: (ids) => `/api/v1/recurring/${ids.recurringRuleId}/occurrences`,
  },
  {
    name: 'PATCH /recurring/:id',
    method: 'PATCH',
    url: (ids) => `/api/v1/recurring/${ids.recurringRuleId}`,
    payload: () => ({ name: 'Renamed by someone else' }),
  },
  {
    name: 'POST /recurring/:id/pause',
    method: 'POST',
    url: (ids) => `/api/v1/recurring/${ids.recurringRuleId}/pause`,
    payload: () => ({}),
  },
  {
    name: 'POST /recurring/:id/resume',
    method: 'POST',
    url: (ids) => `/api/v1/recurring/${ids.recurringRuleId}/resume`,
  },
  {
    name: 'POST /recurring/:id/end',
    method: 'POST',
    url: (ids) => `/api/v1/recurring/${ids.recurringRuleId}/end`,
    payload: () => ({}),
  },
  {
    name: 'DELETE /recurring/:id',
    method: 'DELETE',
    url: (ids) => `/api/v1/recurring/${ids.recurringRuleId}`,
  },
  {
    name: 'POST /recurring/:id/occurrences/:date/confirm',
    method: 'POST',
    url: (ids) =>
      `/api/v1/recurring/${ids.recurringRuleId}/occurrences/${RECURRING_ISOLATION_DATE}/confirm`,
    payload: () => ({}),
  },
  {
    name: 'POST /recurring/:id/occurrences/:date/skip',
    method: 'POST',
    url: (ids) =>
      `/api/v1/recurring/${ids.recurringRuleId}/occurrences/${RECURRING_ISOLATION_DATE}/skip`,
  },
  {
    name: 'POST /recurring/:id/occurrences/:date/override',
    method: 'POST',
    url: (ids) =>
      `/api/v1/recurring/${ids.recurringRuleId}/occurrences/${RECURRING_ISOLATION_DATE}/override`,
    payload: () => ({ amount: { amount: '1.00', currency: 'TRY' } }),
  },
  {
    name: 'DELETE /recurring/:id/occurrences/:date/exception',
    method: 'DELETE',
    url: (ids) =>
      `/api/v1/recurring/${ids.recurringRuleId}/occurrences/${RECURRING_ISOLATION_DATE}/exception`,
  },
]
