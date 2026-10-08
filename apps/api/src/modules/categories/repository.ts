import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { categories, categoryGroups, transactionLines } from '../../db/schema/index.ts'
import { uuidv7 } from '../../lib/uuid.ts'
import type { Executor } from '../ledger/repository.ts'
import { templateRows } from './template.ts'

export interface CategoryGroupRow {
  id: string
  name: string
  kind: string
  systemKey: string | null
  nameOverridden: boolean
  sortOrder: number
}

export interface CategoryRow {
  id: string
  groupId: string
  parentId: string | null
  name: string
  systemKey: string | null
  nameOverridden: boolean
  isEssential: boolean
  sortOrder: number
  archivedAt: Date | null
}

const groupColumns = {
  id: categoryGroups.id,
  name: categoryGroups.name,
  kind: categoryGroups.kind,
  systemKey: categoryGroups.systemKey,
  nameOverridden: categoryGroups.nameOverridden,
  sortOrder: categoryGroups.sortOrder,
} as const

const categoryColumns = {
  id: categories.id,
  groupId: categories.groupId,
  parentId: categories.parentId,
  name: categories.name,
  systemKey: categories.systemKey,
  nameOverridden: categories.nameOverridden,
  isEssential: categories.isEssential,
  sortOrder: categories.sortOrder,
  archivedAt: categories.archivedAt,
} as const

/*
 * Every query here is scoped by `workspace_id` (CLAUDE.md, PLAN §15). A lookup that returns
 * `undefined` for another workspace's id is what lets the API answer 404 instead of 403, so a
 * status code never confirms that an id exists.
 */

export async function findCategoryGroups(
  tx: Executor,
  workspaceId: string,
): Promise<CategoryGroupRow[]> {
  return tx
    .select(groupColumns)
    .from(categoryGroups)
    .where(eq(categoryGroups.workspaceId, workspaceId))
    .orderBy(asc(categoryGroups.sortOrder), asc(categoryGroups.name), asc(categoryGroups.id))
}

export async function findCategories(
  tx: Executor,
  workspaceId: string,
  { includeArchived }: { includeArchived: boolean },
): Promise<CategoryRow[]> {
  const scope = includeArchived
    ? eq(categories.workspaceId, workspaceId)
    : and(eq(categories.workspaceId, workspaceId), isNull(categories.archivedAt))

  return tx
    .select(categoryColumns)
    .from(categories)
    .where(scope)
    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(categories.id))
}

export async function findCategoryById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<CategoryRow | undefined> {
  const [row] = await tx
    .select(categoryColumns)
    .from(categories)
    .where(and(eq(categories.workspaceId, workspaceId), eq(categories.id, id)))
    .limit(1)
  return row
}

export async function findCategoryGroupById(
  tx: Executor,
  workspaceId: string,
  id: string,
): Promise<CategoryGroupRow | undefined> {
  const [row] = await tx
    .select(groupColumns)
    .from(categoryGroups)
    .where(and(eq(categoryGroups.workspaceId, workspaceId), eq(categoryGroups.id, id)))
    .limit(1)
  return row
}

/**
 * Which of these ids name a live, unarchived category of this workspace. The transactions service
 * uses it to check every category on a transaction in one round trip; an id that is missing from
 * the result is either another workspace's or archived, and both are refused the same way.
 */
export async function findLiveCategoryIds(
  tx: Executor,
  workspaceId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.workspaceId, workspaceId),
        inArray(categories.id, [...ids]),
        isNull(categories.archivedAt),
      ),
    )
  return new Set(rows.map((row) => row.id))
}

/** How many transaction lines reference each category, deleted transactions excluded. */
export async function countLinesByCategory(
  tx: Executor,
  workspaceId: string,
): Promise<Map<string, number>> {
  const rows = await tx
    .select({
      categoryId: transactionLines.categoryId,
      count: sql<string>`count(*)`,
    })
    .from(transactionLines)
    .where(
      and(
        eq(transactionLines.workspaceId, workspaceId),
        sql`${transactionLines.categoryId} IS NOT NULL`,
      ),
    )
    .groupBy(transactionLines.categoryId)

  return new Map(
    rows
      .filter((row): row is { categoryId: string; count: string } => row.categoryId !== null)
      .map((row) => [row.categoryId, Number.parseInt(row.count, 10)]),
  )
}

export interface InsertCategoryInput {
  id: string
  workspaceId: string
  groupId: string
  parentId: string | null
  name: string
  isEssential: boolean
  sortOrder: number
}

export async function insertCategory(
  tx: Executor,
  input: InsertCategoryInput,
): Promise<CategoryRow | undefined> {
  const [row] = await tx.insert(categories).values(input).returning(categoryColumns)
  return row
}

export interface UpdateCategoryPatch {
  name?: string
  groupId?: string
  parentId?: string | null
  isEssential?: boolean
  sortOrder?: number
  nameOverridden?: boolean
  archivedAt?: Date | null
}

export async function updateCategory(
  tx: Executor,
  workspaceId: string,
  id: string,
  patch: UpdateCategoryPatch,
): Promise<CategoryRow | undefined> {
  const [row] = await tx
    .update(categories)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(categories.workspaceId, workspaceId), eq(categories.id, id)))
    .returning(categoryColumns)
  return row
}

export interface InsertCategoryGroupInput {
  id: string
  workspaceId: string
  name: string
  kind: string
  sortOrder: number
}

export async function insertCategoryGroup(
  tx: Executor,
  input: InsertCategoryGroupInput,
): Promise<CategoryGroupRow | undefined> {
  const [row] = await tx.insert(categoryGroups).values(input).returning(groupColumns)
  return row
}

export async function updateCategoryGroup(
  tx: Executor,
  workspaceId: string,
  id: string,
  patch: { name?: string; sortOrder?: number; nameOverridden?: boolean },
): Promise<CategoryGroupRow | undefined> {
  const [row] = await tx
    .update(categoryGroups)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(categoryGroups.workspaceId, workspaceId), eq(categoryGroups.id, id)))
    .returning(groupColumns)
  return row
}

/** Moves every line of one category onto another. Returns how many moved. */
export async function moveLinesToCategory(
  tx: Executor,
  workspaceId: string,
  fromId: string,
  toId: string,
): Promise<number> {
  const moved = await tx
    .update(transactionLines)
    .set({ categoryId: toId })
    .where(
      and(eq(transactionLines.workspaceId, workspaceId), eq(transactionLines.categoryId, fromId)),
    )
    .returning({ id: transactionLines.id })
  return moved.length
}

export async function nextCategorySortOrder(
  tx: Executor,
  workspaceId: string,
  groupId: string,
): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${categories.sortOrder})` })
    .from(categories)
    .where(and(eq(categories.workspaceId, workspaceId), eq(categories.groupId, groupId)))
  return (row?.max ?? 0) + 1
}

export async function nextGroupSortOrder(tx: Executor, workspaceId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${categoryGroups.sortOrder})` })
    .from(categoryGroups)
    .where(eq(categoryGroups.workspaceId, workspaceId))
  return (row?.max ?? 0) + 1
}

/**
 * Seeds the default template into a brand-new workspace (§13).
 *
 * Called inside the transaction that creates the workspace, so an account can never exist with a
 * half-seeded set of categories — and the Plan and Transactions screens have somewhere to put
 * money from the first sign-in. `0005_seed_categories.sql` does the same for the workspaces that
 * predate phase 5.
 */
export async function seedDefaultCategories(tx: Executor, workspaceId: string): Promise<void> {
  const groups = templateRows()

  const insertedGroups = await tx
    .insert(categoryGroups)
    .values(
      groups.map((group) => ({
        id: uuidv7(),
        workspaceId,
        name: group.name,
        kind: group.kind,
        systemKey: group.systemKey,
        sortOrder: group.sortOrder,
      })),
    )
    .returning({ id: categoryGroups.id, systemKey: categoryGroups.systemKey })

  const groupIdByKey = new Map(insertedGroups.map((group) => [group.systemKey, group.id]))

  await tx.insert(categories).values(
    groups.flatMap((group) =>
      group.categories.map((category) => ({
        id: uuidv7(),
        workspaceId,
        // Every group was just inserted above, so its id is present.
        groupId: groupIdByKey.get(group.systemKey)!,
        name: category.name,
        systemKey: category.systemKey,
        isEssential: category.isEssential,
        sortOrder: category.sortOrder,
      })),
    ),
  )
}
