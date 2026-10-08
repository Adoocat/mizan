import type { PlainDate, TransactionType } from '@mizan/domain'
import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm'
import { transactionLines, transactions } from '../../db/schema/index.ts'
import type { Executor } from '../ledger/repository.ts'

export interface TransactionRow {
  id: string
  type: string
  date: string
  payee: string | null
  notes: string | null
  status: string
  source: string
  deletedAt: Date | null
}

export interface TransactionLineRow {
  id: string
  transactionId: string
  accountId: string
  categoryId: string | null
  amount: string
  currency: string
  memo: string | null
}

const headerColumns = {
  id: transactions.id,
  type: transactions.type,
  date: transactions.date,
  payee: transactions.payee,
  notes: transactions.notes,
  status: transactions.status,
  source: transactions.source,
  deletedAt: transactions.deletedAt,
} as const

const lineColumns = {
  id: transactionLines.id,
  transactionId: transactionLines.transactionId,
  accountId: transactionLines.accountId,
  categoryId: transactionLines.categoryId,
  amount: transactionLines.amount,
  currency: transactionLines.currency,
  memo: transactionLines.memo,
} as const

/** What the list is filtered by. Every field has already been validated by the route's schema. */
export interface TransactionFilter {
  from?: PlainDate | undefined
  to?: PlainDate | undefined
  accountIds?: readonly string[] | undefined
  categoryIds?: readonly string[] | undefined
  view: 'all' | 'spending' | 'income' | 'transfers' | 'needsReview'
  /** Already folded by the domain's `normalizeSearchText`. */
  search?: string | undefined
  /** Magnitudes, as decimal strings. */
  minAmount?: string | undefined
  maxAmount?: string | undefined
}

const idList = (ids: readonly string[]): SQL =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )

/**
 * A transaction matches a line-level filter when *any* of its lines does, and the whole
 * transaction is then returned — a split whose groceries part matches still shows its other
 * parts, because otherwise the amounts on screen would not add up.
 */
function lineExists(workspaceId: string, condition: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${transactionLines} l
    WHERE l.transaction_id = ${transactions.id}
      AND l.workspace_id = ${workspaceId}::uuid
      AND (${condition})
  )`
}

/** An on-budget line with no category: what "needs review" means (§13). */
const uncategorizedOnBudget = sql`l.category_id IS NULL AND EXISTS (
  SELECT 1 FROM accounts a
  WHERE a.id = l.account_id AND a.workspace_id = l.workspace_id AND a.on_budget
)`

function conditions(workspaceId: string, filter: TransactionFilter): SQL[] {
  const where: SQL[] = [
    eq(transactions.workspaceId, workspaceId),
    // Soft-deleted transactions are gone from every list; only `findTransactionById` still
    // returns one, for the undo that follows a delete (PLAN §7).
    isNull(transactions.deletedAt),
  ]

  if (filter.from) where.push(gte(transactions.date, filter.from))
  if (filter.to) where.push(lte(transactions.date, filter.to))

  if (filter.accountIds?.length) {
    where.push(lineExists(workspaceId, sql`l.account_id IN (${idList(filter.accountIds)})`))
  }
  if (filter.categoryIds?.length) {
    where.push(lineExists(workspaceId, sql`l.category_id IN (${idList(filter.categoryIds)})`))
  }
  if (filter.search) {
    // The GIN trigram index on `search_text` is what makes this substring match fast.
    where.push(sql`${transactions.searchText} LIKE ${`%${filter.search}%`}`)
  }
  if (filter.minAmount) {
    where.push(lineExists(workspaceId, sql`abs(l.amount) >= ${filter.minAmount}::numeric`))
  }
  if (filter.maxAmount) {
    where.push(lineExists(workspaceId, sql`abs(l.amount) <= ${filter.maxAmount}::numeric`))
  }

  switch (filter.view) {
    case 'spending':
      where.push(eq(transactions.type, 'expense'))
      break
    case 'income':
      where.push(eq(transactions.type, 'income'))
      break
    case 'transfers':
      where.push(eq(transactions.type, 'transfer'))
      break
    case 'needsReview':
      // Only expenses and income carry a category at all.
      where.push(
        sql`${transactions.type} IN ('expense', 'income')`,
        lineExists(workspaceId, uncategorizedOnBudget),
      )
      break
    case 'all':
      break
  }

  return where
}

export interface TransactionCursor {
  date: PlainDate
  id: string
}

/**
 * One page of the list, newest first, served by `transactions_workspace_date_idx`.
 *
 * Paging is by cursor, not offset: new transactions arrive at the top all the time, and an offset
 * would skip or repeat rows underneath them. One extra row is read to learn whether another page
 * exists, which saves a second count query.
 */
export async function findTransactions(
  tx: Executor,
  workspaceId: string,
  filter: TransactionFilter,
  { limit, cursor }: { limit: number; cursor?: TransactionCursor | undefined },
): Promise<{ rows: TransactionRow[]; hasMore: boolean }> {
  const where = conditions(workspaceId, filter)
  if (cursor) {
    // The same order as the index: date descending, then id descending to break ties.
    where.push(
      or(
        lt(transactions.date, cursor.date),
        and(eq(transactions.date, cursor.date), lt(transactions.id, cursor.id)),
      )!,
    )
  }

  const rows = await tx
    .select(headerColumns)
    .from(transactions)
    .where(and(...where))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1)

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit }
}

/** The lines of the given transactions, in id order so a split reads as it was entered. */
export async function findLinesFor(
  tx: Executor,
  workspaceId: string,
  transactionIds: readonly string[],
): Promise<TransactionLineRow[]> {
  if (transactionIds.length === 0) return []
  return tx
    .select(lineColumns)
    .from(transactionLines)
    .where(
      and(
        eq(transactionLines.workspaceId, workspaceId),
        inArray(transactionLines.transactionId, [...transactionIds]),
      ),
    )
    .orderBy(transactionLines.transactionId, transactionLines.id)
}

/** Includes soft-deleted transactions: undo has to find what it is restoring. */
export async function findTransactionById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<TransactionRow | undefined> {
  const [row] = await tx
    .select(headerColumns)
    .from(transactions)
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, id)))
    .limit(1)
  return row
}

export interface SummaryRow {
  income: string | null
  spending: string | null
  transfers: string | null
  needsReview: string
  matched: string
}

/**
 * The tiles above the list, over everything the filters match rather than the page on screen.
 *
 * SQL aggregates and the domain applies the rules (§16). `transfers` sums only the receiving leg,
 * because the two legs of a transfer cancel out — summing both would always give zero.
 */
export async function summarize(
  tx: Executor,
  workspaceId: string,
  filter: TransactionFilter,
): Promise<SummaryRow> {
  const amount = transactionLines.amount
  const type = transactions.type

  const [row] = await tx
    .select({
      income: sql<
        string | null
      >`sum(CASE WHEN ${type} = 'income' AND ${amount} > 0 THEN ${amount} ELSE 0 END)`,
      spending: sql<string | null>`sum(CASE WHEN ${type} = 'expense' THEN ${amount} ELSE 0 END)`,
      transfers: sql<
        string | null
      >`sum(CASE WHEN ${type} = 'transfer' AND ${amount} > 0 THEN ${amount} ELSE 0 END)`,
      needsReview: sql<string>`count(DISTINCT CASE
        WHEN ${type} IN ('expense', 'income')
          AND ${transactionLines.categoryId} IS NULL
          AND EXISTS (
            SELECT 1 FROM accounts a
            WHERE a.id = ${transactionLines.accountId}
              AND a.workspace_id = ${transactionLines.workspaceId}
              AND a.on_budget
          )
        THEN ${transactions.id} END)`,
      matched: sql<string>`count(DISTINCT ${transactions.id})`,
    })
    .from(transactions)
    .innerJoin(transactionLines, eq(transactionLines.transactionId, transactions.id))
    .where(and(...conditions(workspaceId, filter)))

  return row ?? { income: null, spending: null, transfers: null, needsReview: '0', matched: '0' }
}

export async function setTransactionDeleted(
  tx: Executor,
  workspaceId: string,
  id: string,
  deletedAt: Date | null,
): Promise<TransactionRow | undefined> {
  const [row] = await tx
    .update(transactions)
    .set({ deletedAt, updatedAt: new Date() })
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, id)))
    .returning(headerColumns)
  return row
}

export interface UpdateHeaderPatch {
  type: TransactionType
  date: PlainDate
  payee: string | null
  notes: string | null
  searchText: string
}

export async function updateTransactionHeader(
  tx: Executor,
  workspaceId: string,
  id: string,
  patch: UpdateHeaderPatch,
): Promise<TransactionRow | undefined> {
  const [row] = await tx
    .update(transactions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.id, id)))
    .returning(headerColumns)
  return row
}

/** Clears a transaction's lines, so an edit can write the new set in the same transaction. */
export async function deleteLinesOf(
  tx: Executor,
  workspaceId: string,
  transactionId: string,
): Promise<void> {
  await tx
    .delete(transactionLines)
    .where(
      and(
        eq(transactionLines.workspaceId, workspaceId),
        eq(transactionLines.transactionId, transactionId),
      ),
    )
}
