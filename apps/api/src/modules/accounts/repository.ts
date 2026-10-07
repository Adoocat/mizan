import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { accounts } from '../../db/schema/index.ts'
import type { Executor } from '../ledger/repository.ts'

export interface AccountRow {
  id: string
  name: string
  type: string
  currency: string
  onBudget: boolean
  includeInNetWorth: boolean
  institution: string | null
  sortOrder: number
  archivedAt: Date | null
}

const columns = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  currency: accounts.currency,
  onBudget: accounts.onBudget,
  includeInNetWorth: accounts.includeInNetWorth,
  institution: accounts.institution,
  sortOrder: accounts.sortOrder,
  archivedAt: accounts.archivedAt,
} as const

/**
 * Every query here is scoped by `workspace_id` (CLAUDE.md, PLAN §15). `findById` returning
 * `undefined` for another workspace's id is what makes the API answer 404 rather than 403, so an
 * attacker cannot use the status code to learn that an account exists.
 */
export async function findAccounts(
  tx: Executor,
  workspaceId: string,
  { includeArchived }: { includeArchived: boolean },
): Promise<AccountRow[]> {
  const scope = includeArchived
    ? eq(accounts.workspaceId, workspaceId)
    : and(eq(accounts.workspaceId, workspaceId), isNull(accounts.archivedAt))

  return tx
    .select(columns)
    .from(accounts)
    .where(scope)
    .orderBy(asc(accounts.sortOrder), asc(accounts.name), asc(accounts.id))
}

export async function findAccountById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<AccountRow | undefined> {
  const [row] = await tx
    .select(columns)
    .from(accounts)
    .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, id)))
    .limit(1)
  return row
}

export interface InsertAccountInput {
  id: string
  workspaceId: string
  name: string
  type: string
  currency: string
  onBudget: boolean
  includeInNetWorth: boolean
  institution: string | null
  sortOrder: number
}

export async function insertAccount(
  tx: Executor,
  input: InsertAccountInput,
): Promise<AccountRow | undefined> {
  const [row] = await tx.insert(accounts).values(input).returning(columns)
  return row
}

export interface UpdateAccountPatch {
  name?: string
  institution?: string | null
  onBudget?: boolean
  includeInNetWorth?: boolean
  sortOrder?: number
  archivedAt?: Date | null
}

export async function updateAccount(
  tx: Executor,
  workspaceId: string,
  id: string,
  patch: UpdateAccountPatch,
): Promise<AccountRow | undefined> {
  const [row] = await tx
    .update(accounts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(accounts.workspaceId, workspaceId), eq(accounts.id, id)))
    .returning(columns)
  return row
}

/** The next free position, so a new account lands at the end of the list. */
export async function nextSortOrder(tx: Executor, workspaceId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${accounts.sortOrder})` })
    .from(accounts)
    .where(eq(accounts.workspaceId, workspaceId))
  return (row?.max ?? -1) + 1
}

export async function countAccounts(db: Db, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<string>`count(*)` })
    .from(accounts)
    .where(eq(accounts.workspaceId, workspaceId))
  return Number.parseInt(row?.count ?? '0', 10)
}
