import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { categories } from './categories.ts'
import { currencies } from './currencies.ts'
import { goals } from './goals.ts'
import { accounts } from './ledger.ts'
import { users } from './auth.ts'
import { workspaces } from './workspaces.ts'

const instant = () => timestamp({ withTimezone: true, mode: 'date' })

/** Money: NUMERIC(20,4), read back as a string and kept one until it enters the domain. */
const money = () => numeric({ precision: 20, scale: 4 })

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
export const WEEKEND_POLICIES = ['none', 'previous_business_day', 'next_business_day'] as const
export const RECURRING_RULE_KINDS = ['expense', 'income', 'transfer'] as const
export const AMOUNT_MODES = ['fixed', 'estimated'] as const
export const RECURRING_RULE_STATUSES = ['active', 'paused'] as const
export const RECURRENCE_EXCEPTION_ACTIONS = ['skip', 'override'] as const

/**
 * A payment that comes round again (PLAN §11).
 *
 * **No occurrence rows.** A rule is a description of a series, and its occurrences are expanded
 * on demand by the domain's `expandRecurrence`. Pre-inserting future transactions would mean the
 * ledger claimed money had moved before it did, every edit would have to rewrite rows nobody had
 * looked at, and a balance would be a statement about the future. The only thing a confirmed
 * occurrence leaves behind is an ordinary transaction (see `transactions.recurring_rule_id`).
 *
 * **No stored "next date" and no stored `ended`.** Both follow from the schedule — ADR 0014 — and
 * a column repeating what the dates already say is exactly the sort of state that drifts. `status`
 * carries only what the dates cannot: that the user has paused the rule.
 */
export const recurringRules = pgTable(
  'recurring_rules',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /**
     * The series this rule belongs to, which is its own id for the first rule of a series.
     *
     * A "this and future" edit ends one rule and starts another from that date; both carry this
     * id, so "the rent" stays one thing to the user while June keeps the rent it actually had.
     * Two rules of one series never overlap — the earlier one's `end_date` is the day before the
     * later one's `start_date` — so their occurrence dates cannot collide.
     */
    seriesId: uuid().notNull(),
    name: text().notNull(),
    kind: text().notNull(),
    payee: text(),
    notes: text(),
    amount: money().notNull(),
    currency: char({ length: 3 })
      .notNull()
      .references(() => currencies.code),
    /** `estimated` shows with a "~" and is asked for again on confirm (§11). */
    amountMode: text().notNull().default('fixed'),

    /** Where the money leaves from, or arrives in for income. */
    accountId: uuid().notNull(),
    /** A transfer's destination; null on every other kind. */
    toAccountId: uuid(),
    categoryId: uuid(),
    /**
     * The goal this rule is about, if any, with the meaning its `kind` gives it: an expense or
     * income occurrence is **funded from** the goal, a transfer **earmarks** for it (§9).
     */
    goalId: uuid(),

    freq: text().notNull(),
    /** Every `interval` periods: 3 with `monthly` is quarterly. */
    interval: smallint().notNull().default(1),
    startDate: date().notNull(),
    /** 1–31 for a monthly rule; null takes the day from `start_date`. 29–31 clamp (§11). */
    byMonthDay: smallint(),
    weekendPolicy: text().notNull().default('none'),
    /** The last date an occurrence may fall on, inclusive. Null runs forever. */
    endDate: date(),
    maxCount: integer(),

    status: text().notNull().default('active'),
    /**
     * The suppression window while paused: `[paused_from, paused_until)`.
     *
     * A pause has a start because "don't ask me about the gym for three months" must not also
     * erase the payments that were already overdue when the user paused it.
     */
    pausedFrom: date(),
    pausedUntil: date(),

    /** Opt-in, fixed amounts only: auto-posting a guess, or a failed payment, drifts silently. */
    autoPost: boolean().notNull().default(false),

    /** Whose transaction an auto-posted occurrence is. Null once that user is deleted. */
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    // The target of the composite foreign key from recurrence_exceptions.
    unique('recurring_rules_id_workspace_key').on(table.id, table.workspaceId),
    /*
     * The same composite-key trick the ledger uses: carrying workspace and currency into the key
     * makes a rule pointing at another workspace's account, or at an account in a different
     * currency, impossible in the database rather than in a service (§7).
     */
    foreignKey({
      name: 'recurring_rules_account_fk',
      columns: [table.accountId, table.workspaceId, table.currency],
      foreignColumns: [accounts.id, accounts.workspaceId, accounts.currency],
    }),
    foreignKey({
      name: 'recurring_rules_to_account_fk',
      columns: [table.toAccountId, table.workspaceId, table.currency],
      foreignColumns: [accounts.id, accounts.workspaceId, accounts.currency],
    }),
    foreignKey({
      name: 'recurring_rules_category_fk',
      columns: [table.categoryId, table.workspaceId],
      foreignColumns: [categories.id, categories.workspaceId],
    }),
    foreignKey({
      name: 'recurring_rules_goal_fk',
      columns: [table.goalId, table.workspaceId],
      foreignColumns: [goals.id, goals.workspaceId],
    }),
    // §7's index: the rules a workspace is running, which every upcoming query starts from.
    index('recurring_rules_workspace_status_idx').on(table.workspaceId, table.status, table.name),
    index('recurring_rules_series_idx').on(table.workspaceId, table.seriesId, table.startDate),
    // The auto-post job's one query: every rule that opted in, across workspaces.
    index('recurring_rules_auto_post_idx')
      .on(table.workspaceId, table.startDate)
      .where(sql`${table.autoPost}`),

    check('recurring_rules_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('recurring_rules_kind_known', sql`${table.kind} IN ('expense', 'income', 'transfer')`),
    check('recurring_rules_amount_not_negative', sql`${table.amount} >= 0`),
    check('recurring_rules_amount_mode_known', sql`${table.amountMode} IN ('fixed', 'estimated')`),
    check(
      'recurring_rules_freq_known',
      sql`${table.freq} IN ('daily', 'weekly', 'monthly', 'yearly')`,
    ),
    check('recurring_rules_interval_positive', sql`${table.interval} BETWEEN 1 AND 365`),
    check(
      'recurring_rules_month_day_range',
      sql`${table.byMonthDay} IS NULL OR ${table.byMonthDay} BETWEEN 1 AND 31`,
    ),
    check(
      'recurring_rules_weekend_policy_known',
      sql`${table.weekendPolicy} IN ('none', 'previous_business_day', 'next_business_day')`,
    ),
    check(
      'recurring_rules_end_after_start',
      sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      'recurring_rules_max_count_range',
      sql`${table.maxCount} IS NULL OR ${table.maxCount} BETWEEN 1 AND 1000`,
    ),
    check('recurring_rules_status_known', sql`${table.status} IN ('active', 'paused')`),
    // A pause window that ran backwards would suppress nothing while claiming to suppress.
    check(
      'recurring_rules_pause_ordered',
      sql`${table.pausedFrom} IS NULL
          OR ${table.pausedUntil} IS NULL
          OR ${table.pausedUntil} > ${table.pausedFrom}`,
    ),
    // Only a paused rule carries a pause window; resuming clears it.
    check(
      'recurring_rules_pause_matches_status',
      sql`${table.status} = 'paused'
          OR (${table.pausedFrom} IS NULL AND ${table.pausedUntil} IS NULL)`,
    ),
    // A transfer has a destination and nothing else does; a transfer never carries a category,
    // because the money has not been spent on anything yet.
    check(
      'recurring_rules_transfer_shape',
      sql`CASE WHEN ${table.kind} = 'transfer'
            THEN ${table.toAccountId} IS NOT NULL
                 AND ${table.toAccountId} <> ${table.accountId}
                 AND ${table.categoryId} IS NULL
            ELSE ${table.toAccountId} IS NULL
          END`,
    ),
    // Opt-in auto-posting never applies to an amount nobody has confirmed (§11).
    check(
      'recurring_rules_auto_post_is_fixed',
      sql`NOT ${table.autoPost} OR ${table.amountMode} = 'fixed'`,
    ),
  ],
)

/**
 * One single-occurrence edit: §11's "only this" (flow F6).
 *
 * Keyed by the **original** date — the series date — so moving an occurrence can never turn it
 * into a different one, and so a rule whose weekend policy changes does not orphan its overrides.
 *
 * Posting is deliberately **not** an action here. §7's sketch gave this table a `transaction_id`
 * for it; a posted occurrence is instead the transaction itself, carrying the rule and the
 * original date (ADR 0014). That keeps the ledger the only place that knows money moved, makes
 * the duplicate check a database constraint rather than a service's judgement, and means deleting
 * that transaction hands the occurrence back as due with nothing left to clean up.
 */
export const recurrenceExceptions = pgTable(
  'recurrence_exceptions',
  {
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ruleId: uuid().notNull(),
    /** The series date this exception is about. */
    originalDate: date().notNull(),
    action: text().notNull(),
    /** Where an override moved it to. Null leaves the date as the schedule had it. */
    overrideDate: date(),
    /** What an override replaced the amount with. Null leaves the rule's own amount. */
    overrideAmount: money(),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    // One exception per occurrence: it is either skipped or moved, never both.
    primaryKey({ columns: [table.ruleId, table.originalDate] }),
    foreignKey({
      name: 'recurrence_exceptions_rule_fk',
      columns: [table.ruleId, table.workspaceId],
      foreignColumns: [recurringRules.id, recurringRules.workspaceId],
    }).onDelete('cascade'),
    index('recurrence_exceptions_workspace_idx').on(table.workspaceId, table.originalDate),
    check('recurrence_exceptions_action_known', sql`${table.action} IN ('skip', 'override')`),
    check(
      'recurrence_exceptions_override_not_negative',
      sql`${table.overrideAmount} IS NULL OR ${table.overrideAmount} >= 0`,
    ),
    /*
     * A skip carries nothing, and an override has to change something: a row that changed neither
     * the date nor the amount would make an occurrence look edited while saying nothing at all.
     */
    check(
      'recurrence_exceptions_shape',
      sql`CASE WHEN ${table.action} = 'skip'
            THEN ${table.overrideDate} IS NULL AND ${table.overrideAmount} IS NULL
            ELSE ${table.overrideDate} IS NOT NULL OR ${table.overrideAmount} IS NOT NULL
          END`,
    ),
  ],
)
