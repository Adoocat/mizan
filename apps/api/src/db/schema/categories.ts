import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { workspaces } from './workspaces.ts'

const instant = () => timestamp({ withTimezone: true, mode: 'date' })

/**
 * A group of categories (PLAN §6). The `kind` is what the plan reasons about: essentials behave
 * differently from flexible spending when a period closes, and the emergency-fund target is built
 * from the essential and debt groups (§9).
 *
 * `system_key` names a group the default template seeded, so the UI can render its name in either
 * language from one stored row; `name_overridden` records that the user renamed it, after which
 * their name wins. A group the user created has no key.
 */
export const categoryGroups = pgTable(
  'category_groups',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    kind: text().notNull(),
    systemKey: text(),
    nameOverridden: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    // The target of the composite foreign key on categories: a category can never point at a
    // group in another workspace.
    unique('category_groups_id_workspace_key').on(table.id, table.workspaceId),
    unique('category_groups_workspace_system_key').on(table.workspaceId, table.systemKey),
    index('category_groups_workspace_idx').on(table.workspaceId, table.sortOrder, table.name),
    check(
      'category_groups_kind_known',
      sql`${table.kind} IN ('income', 'essential', 'flexible', 'debt', 'savings', 'investment')`,
    ),
    check('category_groups_name_not_blank', sql`length(btrim(${table.name})) > 0`),
  ],
)

/**
 * A category (§6). Two levels at most: `parent_id` points at a category in the same workspace,
 * and the service refuses a parent that is itself a child.
 *
 * Categories are archived, never deleted — transaction lines reference them, and a closed period
 * has to stay readable (§7). Merging moves the lines across and archives the source.
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    groupId: uuid().notNull(),
    parentId: uuid(),
    name: text().notNull(),
    systemKey: text(),
    nameOverridden: boolean().notNull().default(false),
    /** Counts towards essential monthly expenses. Seeded from the group's kind. */
    isEssential: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    archivedAt: instant(),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    unique('categories_id_workspace_key').on(table.id, table.workspaceId),
    foreignKey({
      name: 'categories_group_fk',
      columns: [table.groupId, table.workspaceId],
      foreignColumns: [categoryGroups.id, categoryGroups.workspaceId],
    }),
    foreignKey({
      name: 'categories_parent_fk',
      columns: [table.parentId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
    }),
    unique('categories_workspace_system_key').on(table.workspaceId, table.systemKey),
    index('categories_workspace_idx').on(table.workspaceId, table.groupId, table.sortOrder),
    check('categories_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    // A category cannot be its own parent. Deeper cycles are impossible: the service only ever
    // allows a parent that has none itself, so the tree is two levels by construction.
    check(
      'categories_parent_not_self',
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
  ],
)
