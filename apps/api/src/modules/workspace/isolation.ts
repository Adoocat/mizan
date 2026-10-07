import type { IsolationCase } from '../../testing/isolation.ts'

/**
 * `/me` and `/workspace/settings` take no identifier: they always resolve the caller's own
 * workspace. There is therefore no id to tamper with, and the isolation suite checks them through
 * the "a second workspace never sees the first" assertions instead of a denial case.
 *
 * The cases listed here therefore carry `crossTenant: false` and only guard the session
 * requirement.
 */
export const workspaceIsolationCases: readonly IsolationCase[] = [
  { name: 'GET /me', method: 'GET', url: () => '/api/v1/me', crossTenant: false },
  {
    name: 'PATCH /me',
    method: 'PATCH',
    url: () => '/api/v1/me',
    payload: () => ({ name: 'Mallory' }),
    crossTenant: false,
  },
  {
    name: 'GET /workspace/settings',
    method: 'GET',
    url: () => '/api/v1/workspace/settings',
    crossTenant: false,
  },
  {
    name: 'PATCH /workspace/settings',
    method: 'PATCH',
    url: () => '/api/v1/workspace/settings',
    payload: () => ({ periodStartDay: 7 }),
    crossTenant: false,
  },
]
