import { moneyFromDto } from '@mizan/contracts'
import type {
  CreateTransactionInput,
  TransactionDto,
  TransactionLineDto,
  TransactionListQuery,
  TransactionListResponse,
  TransactionSummary,
  UpdateTransactionInput,
} from '@mizan/contracts'
import {
  Money,
  normalizeSearchText,
  searchTextFrom,
  type LedgerLine,
  type PlainDate,
  type TransactionType,
} from '@mizan/domain'
import type { Db } from '../../db/client.ts'
import { uuidv7 } from '../../lib/uuid.ts'
import type { RequestAuth } from '../../plugins/auth.ts'
import { badRequest, conflict, notFound } from '../../plugins/errors.ts'
import { findAccountById, type AccountRow } from '../accounts/repository.ts'
import { findLiveCategoryIds } from '../categories/repository.ts'
import { insertLines, insertTransaction } from '../ledger/repository.ts'
import { validateTransaction } from '../ledger/service.ts'
import { assertCanWrite } from '../workspace/service.ts'
import {
  deleteLinesOf,
  findLinesFor,
  findTransactionById,
  findTransactions,
  setTransactionDeleted,
  summarize,
  updateTransactionHeader,
  type TransactionCursor,
  type TransactionFilter,
  type TransactionLineRow,
  type TransactionRow,
} from './repository.ts'

/* ------------------------------------------------------------------ reading */

function toLineDto(row: TransactionLineRow): TransactionLineDto {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    amount: Money.of(row.amount, row.currency).toDto(),
    memo: row.memo,
  }
}

function toDto(
  row: TransactionRow,
  lines: TransactionLineRow[],
  baseCurrency: string,
): TransactionDto {
  const lineDtos = lines.map(toLineDto)
  return {
    id: row.id,
    // The `transactions_type_known` check constraint keeps these in step with the domain.
    type: row.type as TransactionType,
    date: row.date as PlainDate,
    payee: row.payee,
    notes: row.notes,
    status: row.status as TransactionDto['status'],
    source: row.source as TransactionDto['source'],
    lines: lineDtos,
    total: Money.sum(
      lines.map((line) => Money.of(line.amount, line.currency)),
      baseCurrency,
    )
      .roundToMinor()
      .toDto(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  }
}

const CURSOR_SEPARATOR = '|'

function parseCursor(cursor: string | undefined): TransactionCursor | undefined {
  if (!cursor) return undefined
  const [date, id] = cursor.split(CURSOR_SEPARATOR)
  // The route's schema has already checked the shape, so both parts are present.
  return { date: date as PlainDate, id: id! }
}

const formatCursor = (row: TransactionRow): string => `${row.date}${CURSOR_SEPARATOR}${row.id}`

function toFilter(query: TransactionListQuery): TransactionFilter {
  return {
    from: query.from,
    to: query.to,
    accountIds: query.accountId,
    categoryIds: query.categoryId,
    view: query.view,
    // Folded the same way the stored `search_text` was, so the match is a plain substring (§7).
    search: query.q ? normalizeSearchText(query.q) : undefined,
    minAmount: query.minAmount ? moneyFromDto(query.minAmount).abs().toDto().amount : undefined,
    maxAmount: query.maxAmount ? moneyFromDto(query.maxAmount).abs().toDto().amount : undefined,
  }
}

function toSummary(
  row: Awaited<ReturnType<typeof summarize>>,
  baseCurrency: string,
): TransactionSummary {
  const money = (value: string | null) =>
    (value === null ? Money.zero(baseCurrency) : Money.of(value, baseCurrency))
      .roundToMinor()
      .toDto()

  return {
    income: money(row.income),
    spending: money(row.spending),
    transfers: money(row.transfers),
    needsReview: Number.parseInt(row.needsReview, 10),
    matched: Number.parseInt(row.matched, 10),
  }
}

/**
 * One page of the transaction list plus the totals for the whole filtered set (PLAN §12).
 *
 * The page and the summary run against the same filter, so what the tiles say always describes
 * what the filters select — not only the rows that happen to be on screen.
 */
export async function listTransactions(
  db: Db,
  auth: RequestAuth,
  query: TransactionListQuery,
): Promise<TransactionListResponse> {
  if (query.from && query.to && query.from > query.to) {
    throw badRequest('That date range ends before it starts.')
  }

  const filter = toFilter(query)
  const [page, summaryRow] = await Promise.all([
    findTransactions(db, auth.workspaceId, filter, {
      limit: query.limit,
      cursor: parseCursor(query.cursor),
    }),
    summarize(db, auth.workspaceId, filter),
  ])

  const lines = await findLinesFor(
    db,
    auth.workspaceId,
    page.rows.map((row) => row.id),
  )
  const linesByTransaction = new Map<string, TransactionLineRow[]>()
  for (const line of lines) {
    const bucket = linesByTransaction.get(line.transactionId)
    if (bucket) bucket.push(line)
    else linesByTransaction.set(line.transactionId, [line])
  }

  const base = auth.workspace.baseCurrency
  const last = page.rows.at(-1)

  return {
    transactions: page.rows.map((row) => toDto(row, linesByTransaction.get(row.id) ?? [], base)),
    nextCursor: page.hasMore && last ? formatCursor(last) : null,
    summary: toSummary(summaryRow, base),
  }
}

async function loadTransaction(db: Db, auth: RequestAuth, id: string) {
  const row = await findTransactionById(db, auth.workspaceId, id)
  // Another workspace's id is indistinguishable from one that does not exist.
  if (!row) throw notFound('No such transaction.')
  const lines = await findLinesFor(db, auth.workspaceId, [id])
  return { row, lines }
}

export async function readTransaction(
  db: Db,
  auth: RequestAuth,
  id: string,
): Promise<TransactionDto> {
  const { row, lines } = await loadTransaction(db, auth, id)
  return toDto(row, lines, auth.workspace.baseCurrency)
}

/* ------------------------------------------------------------------ writing */

/** The accounts a write touches, loaded once and checked for this workspace. */
async function loadAccounts(
  db: Db,
  auth: RequestAuth,
  ids: readonly string[],
): Promise<Map<string, AccountRow>> {
  const unique = [...new Set(ids)]
  const rows = await Promise.all(unique.map((id) => findAccountById(db, auth.workspaceId, id)))

  const found = new Map<string, AccountRow>()
  for (const [index, row] of rows.entries()) {
    if (!row) throw notFound('No such account.')
    if (row.archivedAt) throw conflict('That account is archived.')
    found.set(unique[index]!, row)
  }
  return found
}

/** Every category on the write has to be live and belong to this workspace. */
async function assertCategories(
  db: Db,
  auth: RequestAuth,
  ids: readonly (string | null | undefined)[],
): Promise<void> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return

  const live = await findLiveCategoryIds(db, auth.workspaceId, wanted)
  for (const id of wanted) {
    // Archived and foreign ids are refused identically: neither may be assigned to new spending.
    if (!live.has(id)) throw notFound('No such category.')
  }
}

interface PreparedWrite {
  type: TransactionType
  date: PlainDate
  payee: string | null
  notes: string | null
  searchText: string
  lines: LedgerLine[]
  memos: (string | null)[]
}

/**
 * Turns the request into the lines the ledger stores, and runs the invariants over them.
 *
 * The client sends magnitudes — an expense of 1,600, not −1,600 — and the sign comes from the
 * kind of transaction. That is one fewer thing a caller can get wrong, and it means the API, the
 * quick-add form and a later importer all agree on what an expense looks like.
 *
 * `onBudget` is carried onto each line so the domain can decide when a category is required: an
 * on-budget expense needs one, a transfer only needs one when it leaves the budget (§10).
 */
async function prepare(
  db: Db,
  auth: RequestAuth,
  input: CreateTransactionInput | UpdateTransactionInput,
): Promise<PreparedWrite> {
  const base = auth.workspace.baseCurrency
  const payee = input.payee?.trim() ? input.payee.trim() : null
  const notes = input.notes?.trim() ? input.notes.trim() : null

  if (input.type === 'transfer') {
    if (input.fromAccountId === input.toAccountId) {
      throw badRequest('A transfer needs two different accounts.')
    }
    const accounts = await loadAccounts(db, auth, [input.fromAccountId, input.toAccountId])
    await assertCategories(db, auth, [input.categoryId])

    const amount = moneyFromDto(input.amount)
    assertBaseCurrency(amount, base)
    const memo = input.memo?.trim() ? input.memo.trim() : null

    const from = accounts.get(input.fromAccountId)!
    const to = accounts.get(input.toAccountId)!

    return {
      type: 'transfer',
      date: input.date,
      payee,
      notes,
      searchText: searchTextFrom([payee, notes, memo]),
      lines: [
        {
          accountId: from.id,
          amount: amount.negate(),
          categoryId: from.onBudget ? (input.categoryId ?? null) : null,
          onBudget: from.onBudget,
        },
        {
          accountId: to.id,
          amount,
          categoryId: null,
          onBudget: to.onBudget,
        },
      ],
      memos: [memo, memo],
    }
  }

  const accounts = await loadAccounts(db, auth, [input.accountId])
  await assertCategories(
    db,
    auth,
    input.parts.map((part) => part.categoryId),
  )

  const account = accounts.get(input.accountId)!
  const sign = input.type === 'expense' ? -1 : 1
  const memos = input.parts.map((part) => (part.memo?.trim() ? part.memo.trim() : null))

  const lines = input.parts.map((part) => {
    const amount = moneyFromDto(part.amount)
    assertBaseCurrency(amount, base)
    return {
      accountId: account.id,
      amount: amount.times(sign),
      categoryId: part.categoryId ?? null,
      onBudget: account.onBudget,
    }
  })

  return {
    type: input.type,
    date: input.date,
    payee,
    notes,
    searchText: searchTextFrom([payee, notes, ...memos]),
    lines,
    memos,
  }
}

function assertBaseCurrency(amount: Money, baseCurrency: string): void {
  if (amount.currency !== baseCurrency) {
    throw badRequest(`Amounts must be in ${baseCurrency}.`)
  }
}

/**
 * Records a transaction (flow F4). Idempotent on a client-supplied id, so the double tap that
 * quick add invites — or a retry after a dropped response — cannot record the same expense twice
 * (§12).
 */
export async function createTransaction(
  db: Db,
  auth: RequestAuth,
  input: CreateTransactionInput,
): Promise<{ transaction: TransactionDto; created: boolean }> {
  assertCanWrite(auth)

  const id = input.id ?? uuidv7()
  const existing = await findTransactionById(db, auth.workspaceId, id)
  if (existing) {
    const lines = await findLinesFor(db, auth.workspaceId, [id])
    return {
      transaction: toDto(existing, lines, auth.workspace.baseCurrency),
      created: false,
    }
  }

  const prepared = await prepare(db, auth, input)
  validateTransaction({ type: prepared.type, lines: prepared.lines })

  await insertTransaction(db, {
    id,
    workspaceId: auth.workspaceId,
    createdBy: auth.userId,
    type: prepared.type,
    date: prepared.date,
    lines: prepared.lines,
    payee: prepared.payee,
    notes: prepared.notes,
    searchText: prepared.searchText,
    memos: prepared.memos,
  })

  return { transaction: await readTransaction(db, auth, id), created: true }
}

/**
 * Replaces a transaction with what the user now says it is. Header and lines are rewritten in one
 * database transaction, so a split can never be left half-edited.
 */
export async function replaceTransaction(
  db: Db,
  auth: RequestAuth,
  id: string,
  input: UpdateTransactionInput,
): Promise<TransactionDto> {
  assertCanWrite(auth)
  const { row } = await loadTransaction(db, auth, id)

  if (row.deletedAt) throw conflict('Restore the transaction before editing it.')
  if (row.type === 'opening_balance' || row.type === 'adjustment') {
    throw conflict(
      row.type === 'opening_balance'
        ? "An opening balance changes with the account's opening balance, not here."
        : 'A reconciliation adjustment cannot be edited; reconcile the account again.',
    )
  }

  const prepared = await prepare(db, auth, input)
  validateTransaction({ type: prepared.type, lines: prepared.lines })

  await db.transaction(async (tx) => {
    const updated = await updateTransactionHeader(tx, auth.workspaceId, id, {
      type: prepared.type,
      date: prepared.date,
      payee: prepared.payee,
      notes: prepared.notes,
      searchText: prepared.searchText,
    })
    if (!updated) throw notFound('No such transaction.')

    await deleteLinesOf(tx, auth.workspaceId, id)
    await insertLines(tx, {
      transactionId: id,
      workspaceId: auth.workspaceId,
      date: prepared.date,
      lines: prepared.lines,
      memos: prepared.memos,
    })
  })

  return readTransaction(db, auth, id)
}

/**
 * Soft-deletes a transaction (§7). Nothing is removed: the row keeps its lines and stays out of
 * every list until it is restored, which is what makes the Undo in the toast possible.
 */
export async function deleteTransaction(
  db: Db,
  auth: RequestAuth,
  id: string,
): Promise<TransactionDto> {
  assertCanWrite(auth)
  const { row } = await loadTransaction(db, auth, id)
  if (row.deletedAt) throw conflict('That transaction is already deleted.')
  if (row.type === 'opening_balance') {
    throw conflict('Delete the account instead of its opening balance.')
  }

  const deleted = await setTransactionDeleted(db, auth.workspaceId, id, new Date())
  if (!deleted) throw notFound('No such transaction.')
  return readTransaction(db, auth, id)
}

/** Undo. Brings a soft-deleted transaction back exactly as it was, lines and all. */
export async function restoreTransaction(
  db: Db,
  auth: RequestAuth,
  id: string,
): Promise<TransactionDto> {
  assertCanWrite(auth)
  const { row } = await loadTransaction(db, auth, id)
  if (!row.deletedAt) throw conflict('That transaction is not deleted.')

  const restored = await setTransactionDeleted(db, auth.workspaceId, id, null)
  if (!restored) throw notFound('No such transaction.')
  return readTransaction(db, auth, id)
}
