import type { Clock } from '@mizan/domain'
import { buildApp, type App } from '../app.ts'
import { createAuth } from '../auth/auth.ts'
import type { Mailer, PasswordResetMail } from '../auth/mailer.ts'
import type { Database } from '../db/client.ts'

export const TEST_WEB_ORIGIN = 'http://localhost:5173'
export const TEST_AUTH_SECRET = 'test-secret-at-least-thirty-two-characters'

/** Captures what would have been mailed, so reset flows can be driven end to end in a test. */
export interface RecordingMailer extends Mailer {
  readonly sent: PasswordResetMail[]
  /** The token from the most recent reset link. */
  lastResetToken(): string | undefined
}

export function createRecordingMailer(): RecordingMailer {
  const sent: PasswordResetMail[] = []
  return {
    sent,
    async sendPasswordReset(mail) {
      sent.push(mail)
    },
    lastResetToken() {
      const last = sent.at(-1)
      if (!last) return undefined
      // Better Auth mails `<baseURL>/auth/reset-password/<token>?callbackURL=…`.
      return new URL(last.url).pathname.split('/').at(-1)
    },
  }
}

export interface TestApp {
  app: App
  mailer: RecordingMailer
  close(): Promise<void>
}

export interface TestAppOptions {
  /** Better Auth's per-IP limits. Off by default: every injected request shares one address. */
  ipRateLimit?: boolean
  /**
   * Pins "today" for the figures that depend on it — the current period, and the daily allowance
   * that divides what is left by the days that remain (PLAN §10). Defaults to the system clock.
   */
  clock?: Clock
}

/** The real app over a real database, with mail captured instead of sent. */
export async function buildTestApp(
  database: Database,
  { ipRateLimit = false, clock }: TestAppOptions = {},
): Promise<TestApp> {
  const mailer = createRecordingMailer()
  const config = {
    nodeEnv: 'test',
    logLevel: 'silent',
    webOrigin: TEST_WEB_ORIGIN,
    trustProxy: false,
    authSecret: TEST_AUTH_SECRET,
    breachedPasswordCheck: false,
  } as const

  const auth = createAuth({ config, database, mailer, ipRateLimit })
  const app = await buildApp({ config, database, auth, ...(clock ? { clock } : {}) })

  return {
    app,
    mailer,
    async close() {
      await app.close()
    },
  }
}
