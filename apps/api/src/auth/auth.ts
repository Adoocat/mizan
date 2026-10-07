import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { haveIBeenPwned } from 'better-auth/plugins/haveibeenpwned'
import type { AppConfig } from '../config/env.ts'
import type { Database } from '../db/client.ts'
import * as schema from '../db/schema/index.ts'
import { uuidv7 } from '../lib/uuid.ts'
import { createPersonalWorkspace } from '../modules/workspace/repository.ts'
import type { Mailer } from './mailer.ts'
import { hashPassword, verifyPassword } from './password.ts'

/** Every auth endpoint lives under this prefix; the web app calls it same-origin through Vite. */
export const AUTH_BASE_PATH = '/api/v1/auth'

const DAY = 60 * 60 * 24

/** Sliding expiry: a session dies after this long without use. */
export const SESSION_IDLE_SECONDS = 7 * DAY
/** Hard ceiling, enforced by the session guard: no session outlives this, however active. */
export const SESSION_ABSOLUTE_SECONDS = 30 * DAY
/** How often an in-use session's expiry is pushed forward (one write per day, not per request). */
const SESSION_UPDATE_AGE_SECONDS = DAY
/** Re-authentication window for sensitive operations (password change, account deletion). */
const SESSION_FRESH_SECONDS = DAY

const RESET_TOKEN_SECONDS = 60 * 60

/**
 * 12 characters, not the usual 8. Length is the only knob that reliably helps, the HIBP plugin
 * below rejects passwords in the breach corpus, and nobody signs up twice (PLAN §15).
 */
export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 128

export interface AuthDependencies {
  config: Pick<AppConfig, 'nodeEnv' | 'webOrigin' | 'authSecret' | 'breachedPasswordCheck'>
  database: Database
  mailer: Mailer
  /**
   * Per-IP limits on the auth endpoints. On everywhere except the integration suite, which drives
   * dozens of sign-ups from one address; `auth-rate-limit.int.test.ts` turns them back on.
   */
  ipRateLimit?: boolean
}

/**
 * Better Auth owns sign-up, sign-in, sessions and password reset (ADR 0001). Mizan supplies:
 * Argon2id hashing, UUIDv7 ids, the `users`/`sessions`/`auth_accounts`/`verifications` table
 * names from PLAN §7, and the hook that gives every new user their personal workspace.
 */
export function createAuth({ config, database, mailer, ipRateLimit = true }: AuthDependencies) {
  const isProduction = config.nodeEnv === 'production'

  return betterAuth({
    appName: 'Mizan',
    /*
     * The browser only ever sees one origin: the web app, which proxies `/api` to this service.
     * Pointing Better Auth at that origin keeps session cookies first-party and makes the reset
     * links it builds land on the web app's own route.
     */
    baseURL: config.webOrigin,
    basePath: AUTH_BASE_PATH,
    secret: config.authSecret,
    trustedOrigins: [config.webOrigin],
    telemetry: { enabled: false },

    database: drizzleAdapter(database.db, { provider: 'pg', schema, transaction: true }),

    user: {
      modelName: 'users',
      additionalFields: {
        // Set through PATCH /api/v1/me, never by the sign-up payload: the column has a CHECK
        // constraint and an unvalidated client value would surface as a 500.
        locale: { type: 'string', required: false, input: false, defaultValue: 'en' },
        timezone: {
          type: 'string',
          required: false,
          input: false,
          defaultValue: 'Europe/Istanbul',
        },
      },
    },
    session: {
      modelName: 'sessions',
      expiresIn: SESSION_IDLE_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      freshAge: SESSION_FRESH_SECONDS,
    },
    account: { modelName: 'authAccounts' },
    verification: { modelName: 'verifications' },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: true,
      // A reset means the account may have been compromised, so every other session goes.
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) => {
        await mailer.sendPasswordReset({ to: user.email, url })
      },
    },

    /*
     * Rejects passwords found in the Have I Been Pwned corpus; only the first five characters of
     * the SHA-1 hash leave the server (k-anonymity). It is an outbound HTTP call on the sign-up
     * and password-change paths, so the test suites switch it off (AUTH_BREACHED_PASSWORD_CHECK)
     * rather than make CI depend on a third-party service.
     */
    plugins: [haveIBeenPwned({ enabled: config.breachedPasswordCheck })],

    /*
     * Per-IP limits on the auth endpoints. Storage is in-process, which is right for a single
     * instance; a shared store is part of the phase 12 rate-limit review. Per-account limits are
     * layered on top in `plugins/auth-rate-limit.ts`.
     */
    rateLimit: {
      enabled: ipRateLimit,
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        // Generous enough for a shared address (an office, a household behind one NAT) while
        // still stopping bulk account creation.
        '/sign-up/email': { window: 60 * 60, max: 20 },
        '/request-password-reset': { window: 60 * 60, max: 5 },
        '/reset-password': { window: 60 * 60, max: 10 },
        '/change-password': { window: 60 * 60, max: 10 },
      },
    },

    advanced: {
      database: { generateId: () => uuidv7() },
      cookiePrefix: 'mizan',
      useSecureCookies: isProduction,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await createPersonalWorkspace(database.db, user.id)
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
