import { sql } from 'drizzle-orm'
import {
  char,
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './auth.ts'
import { currencies } from './currencies.ts'

const instant = () => timestamp({ withTimezone: true, mode: 'date' })

/**
 * A workspace owns all financial data (decision D6, ADR 0008). The MVP creates exactly one
 * personal workspace per user at sign-up; the model is already plural so shared finance and the
 * "Personal ▾" switcher in the mockups need no migration.
 */
export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid().primaryKey(),
    name: text().notNull(),
    baseCurrency: char({ length: 3 })
      .notNull()
      .references(() => currencies.code),
    /** The day of month the plan period starts — payday (decision D3, ADR 0003). */
    periodStartDay: smallint().notNull().default(1),
    timezone: text().notNull().default('Europe/Istanbul'),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    // 29–31 would skip months, so the anchor stops at 28 (ADR 0003).
    check('workspaces_period_start_day_range', sql`${table.periodStartDay} BETWEEN 1 AND 28`),
    check('workspaces_name_not_blank', sql`length(btrim(${table.name})) > 0`),
  ],
)

export const WORKSPACE_ROLES = ['owner', 'editor', 'viewer'] as const

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text().notNull().default('owner'),
    createdAt: instant().notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_members_user_id_idx').on(table.userId),
    check('workspace_members_role_known', sql`${table.role} IN ('owner', 'editor', 'viewer')`),
  ],
)
