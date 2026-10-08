import type { IsolationCase } from '../../testing/isolation.ts'

/**
 * Every `/categories` and `/category-groups` endpoint, for the cross-tenant suite.
 * `categoryId` and `categoryGroupId` belong to the *victim's* workspace; the attacker must get
 * 404 from all of them — not 403, which would confirm the id exists.
 */
export const categoryIsolationCases: readonly IsolationCase[] = [
  { name: 'GET /categories', method: 'GET', url: () => '/api/v1/categories', crossTenant: false },
  {
    name: 'POST /categories',
    method: 'POST',
    url: () => '/api/v1/categories',
    // The group belongs to the victim, so this doubles as a cross-tenant attempt.
    payload: (ids) => ({ groupId: ids.categoryGroupId, name: 'Intruder category' }),
  },
  {
    name: 'PATCH /categories/:id',
    method: 'PATCH',
    url: (ids) => `/api/v1/categories/${ids.categoryId}`,
    payload: () => ({ name: 'Renamed by someone else' }),
  },
  {
    name: 'POST /categories/:id/archive',
    method: 'POST',
    url: (ids) => `/api/v1/categories/${ids.categoryId}/archive`,
  },
  {
    name: 'POST /categories/:id/unarchive',
    method: 'POST',
    url: (ids) => `/api/v1/categories/${ids.categoryId}/unarchive`,
  },
  {
    name: 'POST /categories/:id/merge',
    method: 'POST',
    url: (ids) => `/api/v1/categories/${ids.categoryId}/merge`,
    payload: (ids) => ({ intoId: ids.otherCategoryId }),
  },
  {
    name: 'POST /categories/reorder',
    method: 'POST',
    url: () => '/api/v1/categories/reorder',
    payload: (ids) => ({ ids: [ids.categoryId] }),
  },
  {
    name: 'POST /category-groups',
    method: 'POST',
    url: () => '/api/v1/category-groups',
    payload: () => ({ name: 'Intruder group', kind: 'flexible' }),
    crossTenant: false,
  },
  {
    name: 'PATCH /category-groups/:id',
    method: 'PATCH',
    url: (ids) => `/api/v1/category-groups/${ids.categoryGroupId}`,
    payload: () => ({ name: 'Renamed by someone else' }),
  },
  {
    name: 'POST /category-groups/reorder',
    method: 'POST',
    url: () => '/api/v1/category-groups/reorder',
    payload: (ids) => ({ ids: [ids.categoryGroupId] }),
  },
]
