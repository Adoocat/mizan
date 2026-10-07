import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Tables owned by Better Auth (PLAN §7). The library reads and writes them through the Drizzle
 * adapter, so the exported names here are the model names configured in `src/auth/auth.ts`, and
 * the property names are the field names Better Auth expects. Everything else in the app treats
 * these tables as read-only; users are created by signing up, never by our own services.
 *
 * Ids are UUIDv7 (`advanced.database.generateId`), so they can be `uuid` columns and be
 * referenced by `workspace_members`.
 */
const instant = () => timestamp({ withTimezone: true, mode: 'date' })

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey(),
    name: text().notNull(),
    /** Better Auth lowercases every email before reading or writing it. */
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    /** UI language (ADR 0002). Mirrors `workspaces.timezone` for display outside a workspace. */
    locale: text().notNull().default('en'),
    timezone: text().notNull().default('Europe/Istanbul'),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
    /** Set when the user asks for erasure; the row is hard-deleted with their workspaces. */
    deletedAt: instant(),
  },
  (table) => [
    check('users_email_lowercase', sql`${table.email} = lower(${table.email})`),
    check('users_locale_supported', sql`${table.locale} IN ('en', 'tr')`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull().unique(),
    expiresAt: instant().notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

/**
 * One row per sign-in method. For email/password there is a single row per user holding the
 * Argon2id hash; social providers (later) add one row each.
 */
export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text().notNull(),
    accountId: text().notNull(),
    password: text(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: instant(),
    refreshTokenExpiresAt: instant(),
    scope: text(),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [index('auth_accounts_user_id_idx').on(table.userId)],
)

/** Single-use, expiring tokens: email verification and password reset. */
export const verifications = pgTable(
  'verifications',
  {
    id: uuid().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: instant().notNull(),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
)
