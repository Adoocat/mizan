import { fromNodeHeaders } from 'better-auth/node'
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AUTH_BASE_PATH, SESSION_ABSOLUTE_SECONDS, type Auth } from '../auth/auth.ts'
import type { Database } from '../db/client.ts'
import { sessions } from '../db/schema/index.ts'
import {
  findMembershipForUser,
  type MembershipRow,
  type WorkspaceRole,
} from '../modules/workspace/repository.ts'
import { createAccountRateLimiter } from './auth-rate-limit.ts'
import { problem } from './errors.ts'

/** Who the request is, and which workspace it may touch. Set by `requireSession`. */
export interface RequestAuth {
  userId: string
  email: string
  name: string
  emailVerified: boolean
  locale: string
  timezone: string
  sessionId: string
  workspaceId: string
  workspace: MembershipRow
  role: WorkspaceRole
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Present only after `requireSession` has run. */
    auth?: RequestAuth
  }
  interface FastifyInstance {
    /** `preHandler` that rejects anonymous requests and loads the workspace context. */
    requireSession: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/** Credential endpoints whose body carries an email, so failures can be counted per account. */
const ACCOUNT_LIMITED_PATHS = new Set(['/sign-in/email', '/request-password-reset'])

const ACCOUNT_RULE = { windowSeconds: 15 * 60, max: 10 }

/** The path within Better Auth, e.g. `/sign-in/email`. */
function authPath(url: string): string {
  const path = url.split('?')[0] ?? ''
  return path.startsWith(AUTH_BASE_PATH) ? path.slice(AUTH_BASE_PATH.length) : path
}

/** The raw body is a Buffer here (see the parser below); auth bodies are always small JSON. */
function emailFromBody(body: unknown): string | undefined {
  if (!Buffer.isBuffer(body) || body.length === 0) return undefined
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const email = (parsed as { email?: unknown }).email
    return typeof email === 'string' && email.length > 0 ? email.trim().toLowerCase() : undefined
  } catch {
    return undefined
  }
}

export interface AuthOptions {
  auth: Auth
  database: Database
  webOrigin: string
}

/**
 * Mounts Better Auth under `/auth/*` and adds `requireSession`.
 *
 * Better Auth speaks the web `Request`/`Response` types, so the handler translates both ways. The
 * route lives in its own encapsulated scope with a pass-through body parser: the exact bytes the
 * client sent have to reach the library, and some of its endpoints are posted with no body at all.
 */
export async function registerAuth(
  app: FastifyInstance,
  { auth, database, webOrigin }: AuthOptions,
) {
  const accountLimiter = createAccountRateLimiter(ACCOUNT_RULE)

  app.decorate('requireSession', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
    if (!session) {
      return problem(reply, request, { status: 401, detail: 'Sign in to continue.' })
    }

    // Better Auth slides the expiry forward while a session is in use. An absolute ceiling on top
    // of that means a stolen cookie cannot be kept alive for ever (PLAN §15).
    const age = Date.now() - session.session.createdAt.getTime()
    if (age > SESSION_ABSOLUTE_SECONDS * 1000) {
      await database.db.delete(sessions).where(eq(sessions.id, session.session.id))
      return problem(reply, request, {
        status: 401,
        detail: 'Your session expired. Sign in again.',
      })
    }

    const workspace = await findMembershipForUser(database.db, session.user.id)
    if (!workspace) {
      request.log.error({ userId: session.user.id }, 'signed-in user has no workspace')
      return problem(reply, request, { status: 403, detail: 'No workspace for this account.' })
    }

    request.auth = {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: session.user.emailVerified,
      locale: session.user.locale ?? 'en',
      timezone: session.user.timezone ?? workspace.timezone,
      sessionId: session.session.id,
      workspaceId: workspace.id,
      workspace,
      role: workspace.role,
    }
  })

  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers()
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body)
    })

    scope.route({
      method: ['GET', 'POST'],
      url: '/auth/*',
      handler: async (request, reply) => {
        const path = authPath(request.url)
        const email = ACCOUNT_LIMITED_PATHS.has(path) ? emailFromBody(request.body) : undefined
        const limiterKey = email ? `${path}:${email}` : undefined

        if (limiterKey) {
          const decision = accountLimiter.check(limiterKey)
          if (!decision.allowed) {
            reply.header('retry-after', String(decision.retryAfter))
            return problem(reply, request, {
              status: 429,
              detail: 'Too many attempts. Try again later.',
            })
          }
        }

        const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
        const response = await auth.handler(
          new Request(new URL(request.url, webOrigin), {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            body: hasBody && Buffer.isBuffer(request.body) ? request.body : undefined,
          }),
        )

        if (limiterKey) {
          if (response.status >= 400) accountLimiter.recordFailure(limiterKey)
          else accountLimiter.reset(limiterKey)
        }

        reply.status(response.status)
        for (const [key, value] of response.headers) {
          if (key.toLowerCase() !== 'set-cookie') reply.header(key, value)
        }
        const cookies = response.headers.getSetCookie()
        if (cookies.length > 0) reply.header('set-cookie', cookies)

        return reply.send(Buffer.from(await response.arrayBuffer()))
      },
    })
  })
}
