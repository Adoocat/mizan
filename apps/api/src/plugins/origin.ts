import type { FastifyInstance } from 'fastify'
import { problem } from './errors.ts'

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** `none` is a user-initiated navigation, which can't carry an attacker's form body. */
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none'])

/**
 * Cross-site request forgery defence for state-changing requests, alongside the `SameSite=Lax`
 * session cookie (PLAN §15).
 *
 * `Sec-Fetch-Site` is checked first because a browser sets it and a page cannot forge it. Older
 * browsers fall back to `Origin`. A request with neither header did not come from a browser — a
 * CLI client or a test — and has no ambient cookie to abuse, so it passes.
 */
export function registerOriginCheck(app: FastifyInstance, options: { webOrigin: string }) {
  app.addHook('onRequest', async (request, reply) => {
    if (!STATE_CHANGING.has(request.method)) return

    const fetchSite = request.headers['sec-fetch-site']
    if (typeof fetchSite === 'string') {
      if (ALLOWED_FETCH_SITES.has(fetchSite)) return
      return problem(reply, request, { status: 403, detail: 'Cross-site request blocked.' })
    }

    const origin = request.headers.origin
    if (typeof origin === 'string' && origin !== 'null' && origin !== options.webOrigin) {
      return problem(reply, request, { status: 403, detail: 'Cross-site request blocked.' })
    }
  })
}
