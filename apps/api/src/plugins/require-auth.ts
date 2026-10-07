import type { FastifyRequest } from 'fastify'
import type { RequestAuth } from './auth.ts'

/**
 * Narrows `request.auth` for a route that runs behind the `requireSession` preHandler.
 *
 * The hook has already answered with 401 when there is no session, so reaching this with no auth
 * means a route forgot the hook — a programming error, not something a client can trigger.
 */
export function requireAuth(request: FastifyRequest): RequestAuth {
  if (!request.auth) throw new Error('Route is missing the requireSession preHandler')
  return request.auth
}
