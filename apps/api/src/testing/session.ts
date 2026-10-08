import { randomUUID } from 'node:crypto'
import type { MeResponse } from '@mizan/contracts'
import type { InjectOptions, LightMyRequestResponse } from 'fastify'
import type { App } from '../app.ts'
import { TEST_WEB_ORIGIN } from './app.ts'

/** A signed-in actor: its cookie, its ids, and a helper that sends requests as it. */
export interface Actor {
  email: string
  password: string
  userId: string
  workspaceId: string
  cookie: string
  request(options: InjectOptions): Promise<LightMyRequestResponse>
}

let counter = 0

export const TEST_PASSWORD = 'correct-horse-battery-staple'

/** Browser-shaped headers, so the origin check and Better Auth's CSRF checks see a real request. */
export function browserHeaders(cookie?: string): Record<string, string> {
  return {
    origin: TEST_WEB_ORIGIN,
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
    ...(cookie ? { cookie } : {}),
  }
}

/** Joins the `Set-Cookie` values from a response into a `Cookie` header. */
export function cookiesFrom(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const values = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
  return values
    .map((value) => value.split(';')[0])
    .filter((value): value is string => Boolean(value))
    .join('; ')
}

/**
 * Signs up a fresh user. Sign-up auto-signs in, so the response carries the session cookie and
 * the personal workspace already exists (created by the Better Auth database hook).
 */
export async function signUpActor(
  app: App,
  overrides: { email?: string; name?: string; password?: string } = {},
): Promise<Actor> {
  counter += 1
  /*
   * The counter is per module, and test files run in parallel workers, so two of them could mint
   * the same address within one millisecond and collide on `users_email_unique`. A random suffix
   * is what actually makes the address unique.
   */
  const email = overrides.email ?? `actor-${counter}-${randomUUID()}@example.test`
  const password = overrides.password ?? TEST_PASSWORD

  const signUp = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-up/email',
    headers: browserHeaders(),
    payload: { name: overrides.name ?? `Actor ${counter}`, email, password },
  })
  if (signUp.statusCode !== 200) {
    throw new Error(`sign-up failed (${signUp.statusCode}): ${signUp.body}`)
  }

  const cookie = cookiesFrom(signUp)
  const request = (options: InjectOptions) =>
    app.inject({
      ...options,
      headers: { ...browserHeaders(cookie), ...options.headers },
    })

  const me = await request({ method: 'GET', url: '/api/v1/me' })
  if (me.statusCode !== 200) throw new Error(`GET /me failed (${me.statusCode}): ${me.body}`)
  const body = me.json<MeResponse>()

  return {
    email,
    password,
    userId: body.user.id,
    workspaceId: body.workspace.id,
    cookie,
    request,
  }
}
