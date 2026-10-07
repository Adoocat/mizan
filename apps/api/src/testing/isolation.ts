import { expect } from 'vitest'
import type { App } from '../app.ts'
import { browserHeaders, type Actor } from './session.ts'

/**
 * The cross-tenant test harness (PLAN §15: "automated cross-tenant test against every
 * endpoint"). Every phase that adds a workspace-scoped endpoint contributes its cases from a
 * `modules/<name>/isolation.ts`, and `modules/isolation.int.test.ts` runs all of them.
 *
 * Each case is exercised with no session at all, which must answer 401. Cases that address a
 * resource by id are also called as a signed-in user from *another* workspace, which must be
 * refused and must not leak the resource.
 */
export interface IsolationCase {
  /** Shown in the assertion message, e.g. `GET /accounts/:id`. */
  name: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Built from ids that belong to the victim's workspace. */
  url: (ids: IsolationIds) => string
  payload?: (ids: IsolationIds) => unknown
  /**
   * Set false for an endpoint that takes no identifier and always resolves the caller's own
   * workspace (`/me`, `/workspace/settings`): there is nothing to tamper with, so only the
   * session requirement is checked.
   */
  crossTenant?: boolean
  /** Statuses that count as a proper denial. Defaults to 403 and 404. */
  denied?: readonly number[]
}

export type IsolationIds = Readonly<Record<string, string>>

const DEFAULT_DENIED = [403, 404] as const

/** Anonymous requests to a protected endpoint must be 401, never 404 or a silent success. */
export async function expectRequiresSession(app: App, testCase: IsolationCase, ids: IsolationIds) {
  const response = await app.inject({
    method: testCase.method,
    url: testCase.url(ids),
    headers: browserHeaders(),
    ...(testCase.payload ? { payload: testCase.payload(ids) as object } : {}),
  })
  expect(response.statusCode, `${testCase.name} without a session`).toBe(401)
}

/** A signed-in user from another workspace must be refused and must see none of the resource. */
export async function expectDeniedAcrossTenants(
  attacker: Actor,
  testCase: IsolationCase,
  ids: IsolationIds,
) {
  const response = await attacker.request({
    method: testCase.method,
    url: testCase.url(ids),
    ...(testCase.payload ? { payload: testCase.payload(ids) as object } : {}),
  })

  const denied = testCase.denied ?? DEFAULT_DENIED
  expect(denied, `${testCase.name} across workspaces (body: ${response.body})`).toContain(
    response.statusCode,
  )

  // Even the refusal must not echo the victim's identifiers back.
  for (const id of Object.values(ids)) {
    expect(response.body, `${testCase.name} leaked ${id}`).not.toContain(id)
  }
}
