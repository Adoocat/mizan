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
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './auth.ts'
import { categories } from './categories.ts'
import { currencies } from './currencies.ts'
import { workspaces } from './workspaces.ts'

const instant = () => timestamp({ withTimezone: true, mode: 'date' })

/** Money: NUMERIC(20,4). Drizzle reads it back as a string, and it stays one until the domain. */
const money = () => numeric({ precision: 20, scale: 4 })
/** FX rate: NUMERIC(20,10). Always null in the MVP, where every account is in TRY (decision D7). */
const fxRate = () => numeric({ precision: 20, scale: 10 })

export const ACCOUNT_TYPES = ['checking', 'savings', 'cash', 'credit_card'] as const

/**
 * Where value lives (PLAN §6). Investment, loan and manual-asset accounts arrive in v1.1.
 *
 * There is deliberately **no balance column**: a balance is the sum of the account's transaction
 * lines, so it can never drift out of step with the ledger (§7). Accounts with history are
 * archived, never deleted.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    type: text().notNull(),
    currency: char({ length: 3 })
      .notNull()
      .references(() => currencies.code),
    /** Whether transactions on this account affect the plan. */
    onBudget: boolean().notNull().default(true),
    includeInNetWorth: boolean().notNull().default(true),
    /** Free text: the bank, or the last four digits the mockups show ("··4471"). */
    institution: text(),
    sortOrder: integer().notNull().default(0),
    archivedAt: instant(),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (table) => [
    /*
     * The target of the composite foreign key on transaction_lines. Carrying workspace and
     * currency into that key makes two mistakes impossible in the database rather than in a
     * service: a line pointing at another workspace's account, and a line whose currency differs
     * from its account's (§7).
     */
    unique('accounts_id_workspace_currency_key').on(table.id, table.workspaceId, table.currency),
    index('accounts_workspace_idx').on(table.workspaceId, table.sortOrder, table.name),
    check(
      'accounts_type_known',
      sql`${table.type} IN ('checking', 'savings', 'cash', 'credit_card')`,
    ),
    check('accounts_name_not_blank', sql`length(btrim(${table.name})) > 0`),
  ],
)

export const TRANSACTION_TYPES = [
  'expense',
  'income',
  'transfer',
  'adjustment',
  'opening_balance',
] as const

/**
 * A financial event: the header for one or more signed lines (§6).
 *
 * `status` and `source` carry the MVP values only; phase 9 (recurring) and phase 13 (import) widen
 * them along with the columns that link a transaction back to a rule or an import batch.
 * Transactions are soft-deleted, which is what makes undo possible (§7).
 */
export const transactions = pgTable(
  'transactions',
  {
    id: uuid().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    /** A business date, not an instant: the day the money moved. */
    date: date().notNull(),
    payee: text(),
    notes: text(),
    status: text().notNull().default('cleared'),
    source: text().notNull().default('manual'),
    /**
     * Payee, notes and line memos, folded to ASCII lower case by the domain's
     * `searchTextFrom` (§7). The normalization rule lives in one place that way, and the
     * database only has to match a substring against the trigram index below — which is what
     * makes `MİGROS` findable by typing `migros`.
     */
    searchText: text().notNull().default(''),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: instant().notNull().defaultNow(),
    updatedAt: instant().notNull().defaultNow(),
    deletedAt: instant(),
  },
  (table) => [
    // Cursor pagination for the transaction list (§7). UUIDv7 ids break date ties by creation.
    index('transactions_workspace_date_idx')
      .on(table.workspaceId, table.date.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    // Substring search over the folded text. A trigram index is what makes `%migros%` — which
    // cannot use a b-tree — fast enough to run on every keystroke.
    index('transactions_search_idx')
      .using('gin', sql`${table.searchText} gin_trgm_ops`)
      .where(sql`${table.deletedAt} IS NULL`),
    check(
      'transactions_type_known',
      sql`${table.type} IN ('expense', 'income', 'transfer', 'adjustment', 'opening_balance')`,
    ),
    check('transactions_status_known', sql`${table.status} IN ('cleared', 'pending')`),
    check('transactions_source_known', sql`${table.source} IN ('manual', 'recurring', 'import')`),
  ],
)

/**
 * One signed movement on one account (§6). Several lines on the same account with different
 * categories are a split; two lines on different accounts are a transfer.
 *
 * `base_amount` is the amount in the workspace's base currency, **frozen at transaction time**, so
 * reports never change when a rate moves (§7). In the MVP it always equals `amount` and `fx_rate`
 * is null; phase 14 is where they diverge.
 *
 * `date` is denormalized from the header so the account- and category-by-date indexes can serve
 * balance and spending queries without joining.
 */
export const transactionLines = pgTable(
  'transaction_lines',
  {
    id: uuid().primaryKey(),
    transactionId: uuid()
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    workspaceId: uuid().notNull(),
    accountId: uuid().notNull(),
    currency: char({ length: 3 }).notNull(),
    /**
     * What this movement was for. Null on an opening balance, a reconciliation and both sides of
     * a transfer that stays inside the budget; required on an on-budget expense or income, which
     * the domain's ledger invariants enforce (§10). `goal_id` joins it in phase 8.
     */
    categoryId: uuid(),
    amount: money().notNull(),
    baseAmount: money().notNull(),
    fxRate: fxRate(),
    date: date().notNull(),
    memo: text(),
  },
  (table) => [
    foreignKey({
      name: 'transaction_lines_account_fk',
      columns: [table.accountId, table.workspaceId, table.currency],
      foreignColumns: [accounts.id, accounts.workspaceId, accounts.currency],
    }),
    // Same idea as the account key: a line can only point at a category of its own workspace.
    foreignKey({
      name: 'transaction_lines_category_fk',
      columns: [table.categoryId, table.workspaceId],
      foreignColumns: [categories.id, categories.workspaceId],
    }),
    index('transaction_lines_account_date_idx').on(table.workspaceId, table.accountId, table.date),
    // Spending per category in a period: the query behind every plan line (§16).
    index('transaction_lines_category_date_idx').on(
      table.workspaceId,
      table.categoryId,
      table.date,
    ),
    index('transaction_lines_transaction_idx').on(table.transactionId),
    // A movement of zero is not a movement; the domain refuses it and so does the database.
    check('transaction_lines_amount_not_zero', sql`${table.amount} <> 0`),
    check('transaction_lines_base_amount_not_zero', sql`${table.baseAmount} <> 0`),
    check(
      'transaction_lines_fx_rate_positive',
      sql`${table.fxRate} IS NULL OR ${table.fxRate} > 0`,
    ),
  ],
)

/*
 * At most one opening-balance transaction per account is a real invariant — a second one would
 * silently double the balance — but it cannot be an index: the account sits on the line while the
 * type sits on the header, and a Postgres index predicate may not contain a subquery.
 *
 * It holds structurally instead. The only code that writes an `opening_balance` transaction is
 * account creation, in the same database transaction as the account insert; reconciling writes an
 * `adjustment`. `accounts.int.test.ts` checks that the API exposes no second route to one.
 */
