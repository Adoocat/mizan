import { z } from 'zod'
import { currencyCodeSchema, periodStartDaySchema } from './primitives.ts'

/** Supported UI languages (ADR 0002). Mirrors the `users_locale_supported` check constraint. */
export const localeSchema = z.enum(['en', 'tr'])
export type Locale = z.infer<typeof localeSchema>

/** Normalized the way the API stores it: trimmed and lowercased (see `users_email_lowercase`). */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))

export const displayNameSchema = z.string().trim().min(1).max(80)

export const workspaceNameSchema = z.string().trim().min(1).max(80)

/**
 * Length is the only password rule that reliably helps, so 12 characters and no composition
 * requirements. The API also rejects passwords found in the Have I Been Pwned corpus (PLAN §15).
 */
export const MIN_PASSWORD_LENGTH = 12
export const MAX_PASSWORD_LENGTH = 128

export const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH)

export const signUpSchema = z.object({
  name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
})
export type SignUpInput = z.infer<typeof signUpSchema>

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})
export type SignInInput = z.infer<typeof signInSchema>

export const forgotPasswordSchema = z.object({ email: emailSchema })
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: passwordSchema,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const workspaceRoleSchema = z.enum(['owner', 'editor', 'viewer'])
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>

export const workspaceSchema = z.object({
  id: z.uuid(),
  name: workspaceNameSchema,
  baseCurrency: currencyCodeSchema,
  periodStartDay: periodStartDaySchema,
  timezone: z.string().min(1),
  role: workspaceRoleSchema,
})
export type WorkspaceDto = z.infer<typeof workspaceSchema>

export const userSchema = z.object({
  id: z.uuid(),
  name: displayNameSchema,
  email: z.string(),
  emailVerified: z.boolean(),
  locale: localeSchema,
  timezone: z.string().min(1),
})
export type UserDto = z.infer<typeof userSchema>

/** `GET /api/v1/me`: everything the app shell needs about the signed-in user. */
export const meResponseSchema = z.object({
  user: userSchema,
  workspace: workspaceSchema,
})
export type MeResponse = z.infer<typeof meResponseSchema>

export const updateMeSchema = z
  .object({ name: displayNameSchema, locale: localeSchema })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  })
export type UpdateMeInput = z.infer<typeof updateMeSchema>

/**
 * The base currency can only change while the workspace has no accounts: account balances and
 * the frozen base amounts on transaction lines are denominated in it (PLAN §7, decision D7).
 */
export const updateWorkspaceSettingsSchema = z
  .object({
    name: workspaceNameSchema,
    baseCurrency: currencyCodeSchema,
    periodStartDay: periodStartDaySchema,
  })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  })
export type UpdateWorkspaceSettingsInput = z.infer<typeof updateWorkspaceSettingsSchema>
