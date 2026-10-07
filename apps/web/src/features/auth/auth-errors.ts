import type { TFunction } from 'i18next'

export interface AuthErrorLike {
  code?: string | undefined
  status?: number | undefined
}

/**
 * Better Auth's error codes, mapped to copy a person can act on. Anything unmapped falls back to
 * a generic message: a raw library code on screen is worse than "something went wrong", and
 * credential errors must stay vague on purpose so they can't be used to probe for accounts.
 */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'auth.errors.invalidCredentials',
  INVALID_PASSWORD: 'auth.errors.invalidCredentials',
  INVALID_EMAIL: 'auth.errors.invalidEmail',
  USER_ALREADY_EXISTS: 'auth.errors.emailTaken',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'auth.errors.emailTaken',
  PASSWORD_COMPROMISED: 'auth.errors.passwordCompromised',
  PASSWORD_TOO_SHORT: 'auth.errors.passwordTooShort',
  PASSWORD_TOO_LONG: 'auth.errors.passwordTooLong',
  INVALID_TOKEN: 'auth.errors.resetLinkInvalid',
  TOKEN_EXPIRED: 'auth.errors.resetLinkInvalid',
  SESSION_EXPIRED: 'auth.errors.sessionExpired',
  EMAIL_NOT_VERIFIED: 'auth.errors.emailNotVerified',
}

export function authErrorMessage(t: TFunction, error: AuthErrorLike | null | undefined): string {
  if (!error) return t('auth.errors.unknown')
  if (error.status === 429) return t('auth.errors.tooManyAttempts')
  const key = error.code ? MESSAGES[error.code] : undefined
  return key ? t(key) : t('auth.errors.unknown')
}
