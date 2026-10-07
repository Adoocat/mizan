import { createAuthClient } from 'better-auth/react'

/**
 * Better Auth's browser client, used only for the credential *actions*: sign up, sign in, sign
 * out, password reset and password change. The signed-in user is read from `GET /api/v1/me`
 * through TanStack Query (see `features/auth/session.ts`), so there is one source of session
 * truth, not two.
 *
 * `baseURL` is left to the current origin: the web app proxies `/api` to the API, so the session
 * cookie stays first-party.
 */
export const authClient = createAuthClient({
  basePath: '/api/v1/auth',
  fetchOptions: {
    /*
     * Resolved per call instead of captured once. The library snapshots `globalThis.fetch` while
     * its own module is evaluating, which is before anything that wraps `fetch` later can run —
     * including the request mocks the component tests install.
     */
    customFetchImpl: (input, init) => globalThis.fetch(input, init),
  },
})
