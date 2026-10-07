import { Money, type LedgerLine, type PlainDate, type TransactionType } from '@mizan/domain'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { transactionLines, transactions } from '../../db/schema/index.ts'
import { uuidv7 } from '../../lib/uuid.ts'

/** Anything that can run queries: the pool, or an open transaction. */
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

export interface WriteTransactionInput {
  workspaceId: string
  createdBy: string
  type: TransactionType
  date: PlainDate
  lines: readonly LedgerLine[]
  payee?: string | null
  notes?: string | null
  /** Per-line memos, aligned with `lines`. */
  memos?: readonly (string | null | undefined)[]
  source?: 'manual' | 'recurring' | 'import'
  /** Client-supplied id, which is what makes a create idempotent (PLAN §12). */
  id?: string
}

/**
 * Writes one transaction and its lines.
 *
 * The caller has already run the domain invariants; the composite foreign key on
 * `transaction_lines` is what guarantees each line's account belongs to this workspace and uses
 * the line's currency, so a line pointing anywhere else fails in the database.
 *
 * `base_amount` equals `amount` and `fx_rate` is null while every account is in the base currency
 * (decision D7); phase 14 is where a real rate goes in.
 */
export async function insertTransaction(
  tx: Executor,
  input: WriteTransactionInput,
): Promise<{ id: string }> {
  const transactionId = input.id ?? uuidv7()

  await tx.insert(transactions).values({
    id: transactionId,
    workspaceId: input.workspaceId,
    type: input.type,
    date: input.date,
    payee: input.payee ?? null,
    notes: input.notes ?? null,
    source: input.source ?? 'manual',
    createdBy: input.createdBy,
  })

  await tx.insert(transactionLines).values(
    input.lines.map((line, index) => {
      const amount = line.amount.toDto()
      return {
        id: uuidv7(),
        transactionId,
        workspaceId: input.workspaceId,
        accountId: line.accountId,
        currency: amount.currency,
        amount: amount.amount,
        baseAmount: amount.amount,
        fxRate: null,
        date: input.date,
        memo: input.memos?.[index] ?? null,
      }
    }),
  )

  return { id: transactionId }
}

export interface AccountBalanceRow {
  accountId: string
  /** NUMERIC comes back as a string and stays one until it enters the domain. */
  total: string
}

/**
 * The balance of every account in a workspace: SQL does the aggregation, the domain applies the
 * rules (PLAN §16). Accounts with no lines are absent from the result, and the caller treats them
 * as zero in the account's own currency.
 */
export async function sumBalancesByAccount(
  tx: Executor,
  workspaceId: string,
): Promise<AccountBalanceRow[]> {
  const rows = await tx
    .select({
      accountId: transactionLines.accountId,
      total: sql<string>`sum(${transactionLines.amount})`,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
    .where(and(eq(transactionLines.workspaceId, workspaceId), isNull(transactions.deletedAt)))
    .groupBy(transactionLines.accountId)

  return rows
}

/** The balance of one account, as a decimal string. `null` when it has no lines at all. */
export async function sumBalanceForAccount(
  tx: Executor,
  workspaceId: string,
  accountId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ total: sql<string | null>`sum(${transactionLines.amount})` })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
    .where(
      and(
        eq(transactionLines.workspaceId, workspaceId),
        eq(transactionLines.accountId, accountId),
        isNull(transactions.deletedAt),
      ),
    )
  return row?.total ?? null
}

export interface LedgerEntryRow {
  id: string
  transactionId: string
  date: string
  type: string
  payee: string | null
  memo: string | null
  amount: string
  currency: string
}

/** An account's most recent movements, newest first. Phase 5 replaces this with the full list. */
export async function findEntriesForAccount(
  tx: Executor,
  workspaceId: string,
  accountId: string,
  limit: number,
): Promise<LedgerEntryRow[]> {
  return tx
    .select({
      id: transactionLines.id,
      transactionId: transactionLines.transactionId,
      date: transactionLines.date,
      type: transactions.type,
      payee: transactions.payee,
      memo: transactionLines.memo,
      amount: transactionLines.amount,
      currency: transactionLines.currency,
    })
    .from(transactionLines)
    .innerJoin(transactions, eq(transactions.id, transactionLines.transactionId))
    .where(
      and(
        eq(transactionLines.workspaceId, workspaceId),
        eq(transactionLines.accountId, accountId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactionLines.date), desc(transactionLines.id))
    .limit(limit)
}

/** Turns a summed NUMERIC string into Money, treating "no rows" as zero. */
export function balanceFrom(total: string | null | undefined, currency: string): Money {
  return total === null || total === undefined
    ? Money.zero(currency)
    : Money.of(total, currency).roundToMinor()
}
