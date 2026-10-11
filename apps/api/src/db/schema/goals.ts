import { sql } from 'drizzle-orm'
import {
  char,
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
  uuid,
} from 'drizzle-orm/pg-core'
import { accounts, transactions } from './ledger.ts'
import { planPeriods } from './plan.ts'
import { currencies } from './currencies.ts'
import { workspaces } from './workspaces.ts'

const instant = () => timestamp({ withTimezone: true, mode: 'date' })

/** Money: NUMERIC(20,4), read back as a string and kept one until it enters the domain. */
const money = () => numeric({ precision: 20, scale: 4 })

export const GOAL_TYPES = ['emergency_fund', 'savings', 'sinking_fund'] as const
export const GOAL_REPEATS = ['monthly', 'quarterly', 'annual'] as const
export const GOAL_CONTRIBUTION_SOURCES = ['manual', 'plan_line', 'transfer', 'rollover'] as const

/**
 * A purpose with a target (PLAN §9).
 *
 * A goal is deliberately *not* a pot of money: where the lira sit is an account's business, and
 * how much of them belongs to this goal is the sum of its contributions. That is what lets one
 * savings account carry an emergency fund, a trip and next year's insurance at once.
 *
 * **No stored progress and no stored status.** What the goal holds is `Σ contributions − goal-funded
 * spending`, and its status follows from that against the target (§16), so both are derived on
 * every read and neither can drift from the ledger. `archived_at` carries the only state that is
 * not derivable — §7's sketch listed a `status` column, which would have been exactly that drift.
 *
 * **An emergency fund stores no target.** Its target is `emergency_months` × the plan's essential
 * and debt allocations, recomputed as the plan changes, so the fund follows the household's real
 * cost of living. The check constraints below are what keep each type's fields straight: a fund
 * with a target of its own, or a savings goal with months of cover, would be meaningless.
 */
export const goals = pgTable(
  'goals',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    name: text().notNull(),
    note: text(),
    /** Null on an emergency fund, whose target is derived from the plan (§9). */
    targetAmount: money(),
    currency: char({ length: 3 })
      .notNull()
      .references(() => currencies.code),
    /** Required on a sinking fund — a bill has a date — and optional on a savings goal. */
    targetDate: date(),
    /** 1, 3 or 6 months of essential spending. Emergency funds only. */
    emergencyMonths: integer(),
    /** How often a sinking fund comes round again. Phase 9 rolls `target_date` forward. */
    repeat: text(),
    /** Where the money is meant to sit, for the over-earmark warning (§9). */
    keptInAccountId: uuid(),
    /** The user's own ordering on the Goals page. */
    priority: integer().notNull().default(0),
    archivedAt: instant(),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    // The target of the composite foreign keys from contributions, plan lines and transaction
    // lines: none of them can ever join two workspaces' rows.
    unique('goals_id_workspace_key').on(table.id, table.workspaceId),
    foreignKey({
      name: 'goals_kept_in_account_fk',
      columns: [table.keptInAccountId, table.workspaceId, table.currency],
      foreignColumns: [accounts.id, accounts.workspaceId, accounts.currency],
    }),
    index('goals_workspace_idx').on(table.workspaceId, table.priority, table.name),
    check('goals_type_known', sql`${table.type} IN ('emergency_fund', 'savings', 'sinking_fund')`),
    check('goals_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check(
      'goals_target_not_negative',
      sql`${table.targetAmount} IS NULL OR ${table.targetAmount} >= 0`,
    ),
    // An emergency fund has months of cover and no target of its own; every other type is the
    // other way round. This is decision 1 of this phase, held in the database.
    check(
      'goals_target_matches_type',
      sql`CASE WHEN ${table.type} = 'emergency_fund'
            THEN ${table.targetAmount} IS NULL AND ${table.emergencyMonths} IS NOT NULL
            ELSE ${table.targetAmount} IS NOT NULL AND ${table.emergencyMonths} IS NULL
          END`,
    ),
    check(
      'goals_emergency_months_known',
      sql`${table.emergencyMonths} IS NULL OR ${table.emergencyMonths} IN (1, 3, 6)`,
    ),
    // A bill has a date. Without one there would be nothing to divide the remainder by, and the
    // fund would be a savings goal wearing another name.
    check(
      'goals_sinking_fund_has_date',
      sql`${table.type} <> 'sinking_fund' OR ${table.targetDate} IS NOT NULL`,
    ),
    // Only something with a due date can come round again.
    check(
      'goals_repeat_known',
      sql`${table.repeat} IS NULL
          OR (${table.type} = 'sinking_fund'
              AND ${table.repeat} IN ('monthly', 'quarterly', 'annual'))`,
    ),
  ],
)

/**
 * Earmarking money for a goal, or releasing it back (§9, flow F8).
 *
 * `amount` is signed: positive earmarks, negative releases. Nothing moves between accounts — a
 * contribution is a statement about money the user already has, which is why the MVP's goals work
 * without any of the account plumbing that "combined" goals need in v2.
 *
 * Spending **out** of a goal is not here: a goal-funded expense carries `goal_id` on its
 * transaction line, so the ledger stays the one place that knows about it and correcting or
 * undeleting that expense moves the goal with it. A second row here would be free to drift.
 *
 * `period_id` is which plan month the contribution counted in, so a goal's plan line can sum the
 * contributions "dated in P" (§10) and a rollover written at close can say where it came from.
 */
export const goalContributions = pgTable(
  'goal_contributions',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    goalId: uuid().notNull(),
    /** A business date, not an instant: the day the money was set aside. */
    date: date().notNull(),
    amount: money().notNull(),
    currency: char({ length: 3 })
      .notNull()
      .references(() => currencies.code),
    source: text().notNull(),
    /**
     * The transfer this contribution records, when one was linked to it (§9).
     *
     * A plain reference rather than a composite one, unlike `goal_id` below. Two reasons: a
     * composite `ON DELETE SET NULL` would try to null this row's `workspace_id` as well, which
     * is NOT NULL, so the cascade could not run at all; and this column is provenance, not the
     * link the figures are built from. The service checks the transaction belongs to the caller's
     * workspace before writing it, and the cross-tenant suite covers that it does.
     */
    transactionId: uuid().references(() => transactions.id, { onDelete: 'set null' }),
    /** Which plan month it counted in. Provenance too, and a plain reference for the same reason. */
    periodId: uuid().references(() => planPeriods.id, { onDelete: 'set null' }),
    note: text(),
    createdAt: instant().notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'goal_contributions_goal_fk',
      columns: [table.goalId, table.workspaceId],
      foreignColumns: [goals.id, goals.workspaceId],
    }).onDelete('cascade'),
    // A goal's own history, and the per-period sums behind its plan line (§9 indexes).
    index('goal_contributions_goal_date_idx').on(table.workspaceId, table.goalId, table.date),
    index('goal_contributions_period_idx').on(table.workspaceId, table.periodId),
    // A contribution of zero says nothing; the domain refuses it and so does the database.
    check('goal_contributions_amount_not_zero', sql`${table.amount} <> 0`),
    check(
      'goal_contributions_source_known',
      sql`${table.source} IN ('manual', 'plan_line', 'transfer', 'rollover')`,
    ),
    /*
     * A contribution that names a transaction is sourced from one. Deliberately one-way rather
     * than a biconditional: a `transfer` contribution whose transaction is later deleted has its
     * link set to null, and its source still says truthfully where the money came from. Requiring
     * the link to exist would make that row unwritable and the delete impossible.
     */
    check(
      'goal_contributions_transaction_is_transfer',
      sql`${table.transactionId} IS NULL OR ${table.source} = 'transfer'`,
    ),
  ],
)
