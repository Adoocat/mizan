import type { IsolationCase } from '../../testing/isolation.ts'

/**
 * The month the cross-tenant fixtures plan. It is a literal rather than one of the fixture ids,
 * because a date is not a secret: the suite also asserts that no refusal echoes an id back, and
 * the start date legitimately appears in every plan URL.
 */
export const PLAN_ISOLATION_START = '2026-10-01'

/**
 * Every `/plans` endpoint, for the cross-tenant suite.
 *
 * Reading a plan takes no identifier — it always resolves the caller's own workspace, like
 * `/me` — so those two are checked only for the session requirement. The writes all carry one of
 * the victim's ids and must answer 404, never 403, which would confirm that the id exists.
 */
export const planIsolationCases: readonly IsolationCase[] = [
  {
    name: 'GET /plans/current',
    method: 'GET',
    url: () => '/api/v1/plans/current',
    crossTenant: false,
  },
  {
    name: 'GET /plans/:start',
    method: 'GET',
    url: () => `/api/v1/plans/${PLAN_ISOLATION_START}`,
    crossTenant: false,
  },
  {
    name: 'PUT /plans/:start/lines',
    method: 'PUT',
    url: () => `/api/v1/plans/${PLAN_ISOLATION_START}/lines`,
    // The category belongs to the victim, so this doubles as a cross-tenant attempt.
    payload: (ids) => ({
      target: 'category',
      categoryId: ids.categoryId,
      planned: { amount: '1000.00', currency: 'TRY' },
    }),
  },
  {
    name: 'POST /plans/:start/income-items',
    method: 'POST',
    url: () => `/api/v1/plans/${PLAN_ISOLATION_START}/income-items`,
    payload: (ids) => ({
      categoryId: ids.incomeCategoryId,
      expected: { amount: '46000.00', currency: 'TRY' },
    }),
  },
  {
    name: 'PATCH /plans/:start/income-items/:id',
    method: 'PATCH',
    url: (ids) => `/api/v1/plans/${PLAN_ISOLATION_START}/income-items/${ids.planIncomeItemId}`,
    payload: () => ({ expected: { amount: '1.00', currency: 'TRY' } }),
  },
  {
    name: 'DELETE /plans/:start/income-items/:id',
    method: 'DELETE',
    url: (ids) => `/api/v1/plans/${PLAN_ISOLATION_START}/income-items/${ids.planIncomeItemId}`,
  },
  {
    name: 'POST /plans/:start/copy-from/:from',
    method: 'POST',
    // The attacker has no plan for the source month, so copying it is refused the same way a
    // month that never existed is.
    url: () => `/api/v1/plans/2026-11-01/copy-from/${PLAN_ISOLATION_START}`,
    payload: () => ({}),
  },
]
