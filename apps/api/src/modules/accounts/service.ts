import { moneyFromDto } from '@mizan/contracts'
import type {
  AccountDetailResponse,
  AccountDto,
  AccountListResponse,
  CreateAccountInput,
  ReconcileAccountResponse,
  ReconcileAccountInput,
  UpdateAccountInput,
} from '@mizan/contracts'
import {
  accountBalance,
  accountType,
  isAllowedAccountCurrency,
  Money,
  netWorth,
  openingBalanceLine,
  reconcileAdjustment,
  todayIn,
  type AccountType,
  type Clock,
  type PlainDate,
} from '@mizan/domain'
import type { Db } from '../../db/client.ts'
import { uuidv7 } from '../../lib/uuid.ts'
import type { RequestAuth } from '../../plugins/auth.ts'
import { badRequest, conflict, notFound } from '../../plugins/errors.ts'
import {
  balanceFrom,
  findEntriesForAccount,
  insertTransaction,
  sumBalanceForAccount,
  sumBalancesByAccount,
} from '../ledger/repository.ts'
import { validateTransaction } from '../ledger/service.ts'
import { assertCanWrite } from '../workspace/service.ts'
import {
  findAccountById,
  findAccounts,
  insertAccount,
  nextSortOrder,
  updateAccount,
  type AccountRow,
} from './repository.ts'

/** How many recent movements the account detail view shows. Phase 5 brings the full list. */
const ENTRY_LIMIT = 50

function toDto(row: AccountRow, balance: Money): AccountDto {
  return {
    id: row.id,
    name: row.name,
    // The `accounts_type_known` check constraint keeps these in step with the domain registry.
    type: row.type as AccountType,
    currency: balance.currency,
    institution: row.institution,
    onBudget: row.onBudget,
    includeInNetWorth: row.includeInNetWorth,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    balance: balance.toDto(),
  }
}

/**
 * Every account with its balance. SQL sums the lines in one query and the domain applies the
 * rules (PLAN §16); an account with no lines yet is simply absent from the sums and reads as zero.
 */
export async function listAccounts(
  db: Db,
  auth: RequestAuth,
  { includeArchived }: { includeArchived: boolean },
): Promise<AccountListResponse> {
  const [rows, sums] = await Promise.all([
    findAccounts(db, auth.workspaceId, { includeArchived }),
    sumBalancesByAccount(db, auth.workspaceId),
  ])

  const totals = new Map(sums.map((sum) => [sum.accountId, sum.total]))
  const base = auth.workspace.baseCurrency

  const accountDtos = rows.map((row) => toDto(row, balanceFrom(totals.get(row.id), row.currency)))

  const balances = rows.map((row, index) => ({
    balance: moneyFromDto(accountDtos[index]!.balance),
    type: row.type as AccountType,
    includeInNetWorth: row.includeInNetWorth,
  }))

  return {
    accounts: accountDtos,
    netWorth: netWorth(balances, base).toDto(),
    onBudgetTotal: accountBalance(
      rows
        .filter((row) => row.onBudget)
        .map((row) => balanceFrom(totals.get(row.id), row.currency)),
      base,
    ).toDto(),
  }
}

async function loadAccount(db: Db, auth: RequestAuth, id: string): Promise<AccountRow> {
  const row = await findAccountById(db, auth.workspaceId, id)
  // Another workspace's id is indistinguishable from one that does not exist.
  if (!row) throw notFound('No such account.')
  return row
}

async function balanceOf(db: Db, auth: RequestAuth, row: AccountRow): Promise<Money> {
  const total = await sumBalanceForAccount(db, auth.workspaceId, row.id)
  return balanceFrom(total, row.currency)
}

export async function readAccount(
  db: Db,
  auth: RequestAuth,
  id: string,
): Promise<AccountDetailResponse> {
  const row = await loadAccount(db, auth, id)
  const [balance, entries] = await Promise.all([
    balanceOf(db, auth, row),
    findEntriesForAccount(db, auth.workspaceId, row.id, ENTRY_LIMIT),
  ])

  return {
    account: toDto(row, balance),
    entries: entries.map((entry) => ({
      id: entry.id,
      transactionId: entry.transactionId,
      date: entry.date as PlainDate,
      type: entry.type as AccountDetailResponse['entries'][number]['type'],
      payee: entry.payee,
      memo: entry.memo,
      amount: Money.of(entry.amount, entry.currency).toDto(),
    })),
  }
}

/**
 * Creates an account and, when the user said what it holds, its opening balance — both in one
 * database transaction, so an account can never exist with a half-written opening balance.
 *
 * The create is idempotent: the client generates the id, and a repeat with the same id returns the
 * account that already exists rather than a second one (§12). That makes a double tap, or a retry
 * after a dropped response, harmless.
 */
export async function createAccount(
  db: Db,
  auth: RequestAuth,
  clock: Clock,
  input: CreateAccountInput,
): Promise<{ account: AccountDto; created: boolean }> {
  assertCanWrite(auth)

  const base = auth.workspace.baseCurrency
  if (input.openingBalance && !isAllowedAccountCurrency(input.openingBalance.currency, base)) {
    throw badRequest(`Accounts must use the workspace base currency (${base}).`)
  }

  const id = input.id ?? uuidv7()

  const existing = await findAccountById(db, auth.workspaceId, id)
  if (existing) {
    return { account: toDto(existing, await balanceOf(db, auth, existing)), created: false }
  }

  const info = accountType(input.type)
  const opening = input.openingBalance
    ? openingBalanceLine(id, moneyFromDto(input.openingBalance))
    : null
  const openingDate = input.openingBalanceDate ?? todayIn(clock, auth.workspace.timezone)

  const row = await db.transaction(async (tx) => {
    const inserted = await insertAccount(tx, {
      id,
      workspaceId: auth.workspaceId,
      name: input.name,
      type: input.type,
      currency: base,
      onBudget: input.onBudget ?? info.defaultOnBudget,
      includeInNetWorth: input.includeInNetWorth ?? true,
      institution: input.institution?.trim() ? input.institution.trim() : null,
      sortOrder: await nextSortOrder(tx, auth.workspaceId),
    })
    if (!inserted) throw new Error('Account insert returned no row')

    if (opening) {
      const transaction = { type: 'opening_balance' as const, lines: [opening] }
      validateTransaction(transaction)
      await insertTransaction(tx, {
        workspaceId: auth.workspaceId,
        createdBy: auth.userId,
        type: 'opening_balance',
        date: openingDate,
        lines: transaction.lines,
      })
    }

    return inserted
  })

  const balance = opening ? opening.amount : Money.zero(base)
  return { account: toDto(row, balance), created: true }
}

export async function patchAccount(
  db: Db,
  auth: RequestAuth,
  id: string,
  input: UpdateAccountInput,
): Promise<AccountDto> {
  assertCanWrite(auth)
  await loadAccount(db, auth, id)

  const patch = {
    ...input,
    ...(input.institution === undefined
      ? {}
      : { institution: input.institution?.trim() ? input.institution.trim() : null }),
  }

  const row = await updateAccount(db, auth.workspaceId, id, patch)
  if (!row) throw notFound('No such account.')
  return toDto(row, await balanceOf(db, auth, row))
}

/**
 * Archives an account. It keeps its history and still counts towards past periods — that is why
 * accounts are archived and never deleted (§7).
 */
export async function setAccountArchived(
  db: Db,
  auth: RequestAuth,
  id: string,
  archived: boolean,
): Promise<AccountDto> {
  assertCanWrite(auth)
  const current = await loadAccount(db, auth, id)

  if (archived === (current.archivedAt !== null)) {
    throw conflict(archived ? 'That account is already archived.' : 'That account is not archived.')
  }

  const row = await updateAccount(db, auth.workspaceId, id, {
    archivedAt: archived ? new Date() : null,
  })
  if (!row) throw notFound('No such account.')
  return toDto(row, await balanceOf(db, auth, row))
}

/**
 * Reconciling against a statement. The user types the balance their bank shows; Mizan works out
 * the difference from its own figure and writes that single `adjustment` transaction. When the
 * two already agree, nothing is written (§16).
 */
export async function reconcileAccount(
  db: Db,
  auth: RequestAuth,
  clock: Clock,
  id: string,
  input: ReconcileAccountInput,
): Promise<ReconcileAccountResponse> {
  assertCanWrite(auth)
  const row = await loadAccount(db, auth, id)

  if (row.archivedAt) throw conflict('Unarchive the account before reconciling it.')
  if (input.statementBalance.currency !== row.currency) {
    throw badRequest(`That account is in ${row.currency}.`)
  }

  const date = input.date ?? todayIn(clock, auth.workspace.timezone)

  const balance = await db.transaction(async (tx) => {
    const derived = balanceFrom(
      await sumBalanceForAccount(tx, auth.workspaceId, row.id),
      row.currency,
    )
    const adjustment = reconcileAdjustment(derived, moneyFromDto(input.statementBalance))
    if (adjustment.isZero()) return { balance: derived, adjustment }

    const lines = [{ accountId: row.id, amount: adjustment, categoryId: null, goalId: null }]
    validateTransaction({ type: 'adjustment', lines })
    await insertTransaction(tx, {
      workspaceId: auth.workspaceId,
      createdBy: auth.userId,
      type: 'adjustment',
      date,
      lines,
      payee: null,
      memos: [input.memo ?? null],
    })

    return { balance: derived.plus(adjustment), adjustment }
  })

  return {
    account: toDto(row, balance.balance),
    adjustment: balance.adjustment.toDto(),
  }
}
