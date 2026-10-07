export interface PasswordResetMail {
  to: string
  /** The one-time link the user follows. Treated as a secret: never logged outside development. */
  url: string
}

export interface Mailer {
  sendPasswordReset(mail: PasswordResetMail): Promise<void>
}

/** The part of a pino logger (or of `console`) the mailer needs. */
export interface MailLogger {
  info(message: string): void
  info(fields: object, message: string): void
}

/**
 * The MVP has no mail provider yet (it arrives with the release work in phase 12).
 *
 * In development the reset link is printed to the console so the flow can be walked end to end.
 * Anywhere else only the event is recorded — never the address, the link or the token, because a
 * reset link is a bearer credential and logs are not a safe place for one (PLAN §15).
 */
export function createConsoleMailer(logger: MailLogger, printLinks: boolean): Mailer {
  return {
    async sendPasswordReset({ to, url }) {
      if (printLinks) {
        logger.info(`[dev mail] password reset for ${to}\n  ${url}`)
        return
      }
      logger.info({ mail: 'password-reset' }, 'password reset mail requested')
    },
  }
}
