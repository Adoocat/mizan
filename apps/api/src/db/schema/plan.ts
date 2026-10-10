import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { categories } from './categories.ts'
import { workspaces } from './workspaces.ts'

const instant = () => timestamp({ withTimezone: true, mode: 'date' })

/** Money: NUMERIC(20,4), read back as a string and kept one until it enters the domain. */
const money = () => numeric({ precision: 20, scale: 4 })

export const PLAN_PERIOD_STATUSES = ['open', 'closed'] as const

/**
 * One budget month, anchored to the workspace's `period_start_day` (PLAN §6, decision D3).
 *
 * The bounds are stored rather than recomputed, because the anchor can change: a user who moves
 * payday from the 1st to the 15th must not silently restate the months they have already
 * planned. `[start_date, end_date)` is half-open — `end_date` is the first day of the next
 * period — so periods can neither overlap nor leave a day uncovered.
 *
 * A period row exists only once something has been planned in it. Until then the API serves the
 * month from its computed bounds with no lines, which is what lets the Plan page show a month
 * that has spending but no plan yet.
 */
export const planPeriods = pgTable(
  'plan_periods',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    startDate: date().notNull(),
    endDate: date().notNull(),
    /** `open` until the month review closes it (phase 10). */
    status: text().notNull().default('open'),
    closedAt: instant(),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    // The target of the composite foreign keys below: a line or an income item can never point
    // at another workspace's period.
    unique('plan_periods_id_workspace_key').on(table.id, table.workspaceId),
    unique('plan_periods_workspace_start_key').on(table.workspaceId, table.startDate),
    index('plan_periods_workspace_idx').on(table.workspaceId, table.startDate),
    check('plan_periods_range_ordered', sql`${table.endDate} > ${table.startDate}`),
    check('plan_periods_status_known', sql`${table.status} IN ('open', 'closed')`),
    // Closed is the only state that has a closing instant, and it always has one.
    check(
      'plan_periods_closed_at_matches_status',
      sql`(${table.status} = 'closed') = (${table.closedAt} IS NOT NULL)`,
    ),
  ],
)

/**
 * Income the user expects during a period (§6, flow F2).
 *
 * `expected_amount` is what the plan counts until the money is confirmed; `received_amount` is
 * what actually arrived, written when the user marks the item received. Keeping the confirmed
 * figure here rather than deriving it from the ledger is what lets a salary that landed ₺2,000
 * short show the plan as over-allocated: the domain's `countedIncome` compares the two (§10).
 *
 * `category_id` is an income category, which is how unplanned income is told apart from income
 * an item already claims.
 */
export const planIncomeItems = pgTable(
  'plan_income_items',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    periodId: uuid().notNull(),
    categoryId: uuid().notNull(),
    /** What the user calls it — "Salary", "Atölye invoice". Blank falls back to the category. */
    label: text(),
    expectedAmount: money().notNull(),
    expectedDate: date(),
    receivedAmount: money(),
    receivedAt: instant(),
    sortOrder: integer().notNull().default(0),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'plan_income_items_period_fk',
      columns: [table.periodId, table.workspaceId],
      foreignColumns: [planPeriods.id, planPeriods.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'plan_income_items_category_fk',
      columns: [table.categoryId, table.workspaceId],
      foreignColumns: [categories.id, categories.workspaceId],
    }),
    index('plan_income_items_period_idx').on(table.workspaceId, table.periodId, table.sortOrder),
    check('plan_income_items_expected_not_negative', sql`${table.expectedAmount} >= 0`),
    check(
      'plan_income_items_received_not_negative',
      sql`${table.receivedAmount} IS NULL OR ${table.receivedAmount} >= 0`,
    ),
    // An item is either confirmed — with both an amount and the instant it was confirmed — or not.
    check(
      'plan_income_items_received_complete',
      sql`(${table.receivedAmount} IS NULL) = (${table.receivedAt} IS NULL)`,
    ),
  ],
)

/**
 * One allocation in a period: money given a job (§6, §10).
 *
 * A line targets a category **or** the pool. `goal_id` joins the choice in phase 8, which is
 * when goals exist to point at; until then a savings allocation is a line on a savings category.
 * The pool — "Available to spend" — is the single line that covers every flexible category
 * without one of its own, and there can be at most one of it per period.
 *
 * `carry_in` is what the previous period's close left to this line (phase 10); it is zero until
 * then. `version` is bumped on every edit so the inline editing on the Plan page can refuse a
 * write built on an amount the user is no longer looking at.
 */
export const planLines = pgTable(
  'plan_lines',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    periodId: uuid().notNull(),
    categoryId: uuid(),
    isPool: boolean().notNull().default(false),
    plannedAmount: money().notNull(),
    carryIn: money().notNull().default('0'),
    /** Whether this line's leftover stays with it when the period closes (§10). */
    rollover: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    version: integer().notNull().default(1),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'plan_lines_period_fk',
      columns: [table.periodId, table.workspaceId],
      foreignColumns: [planPeriods.id, planPeriods.workspaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'plan_lines_category_fk',
      columns: [table.categoryId, table.workspaceId],
      foreignColumns: [categories.id, categories.workspaceId],
    }),
    // One line per category per period: two would make "what is left" ambiguous.
    unique('plan_lines_period_category_key').on(table.periodId, table.categoryId),
    uniqueIndex('plan_lines_period_pool_key')
      .on(table.periodId)
      .where(sql`${table.isPool}`),
    index('plan_lines_period_idx').on(table.workspaceId, table.periodId, table.sortOrder),
    // Exactly one target. Phase 8 widens this to include `goal_id`.
    check('plan_lines_one_target', sql`(${table.categoryId} IS NOT NULL) <> ${table.isPool}`),
    check('plan_lines_planned_not_negative', sql`${table.plannedAmount} >= 0`),
  ],
)
