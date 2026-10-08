import type {
  CategoryDto,
  CategoryGroupDto,
  CategoryListResponse,
  CreateCategoryGroupInput,
  CreateCategoryInput,
  MergeCategoryResponse,
  ReorderInput,
  UpdateCategoryGroupInput,
  UpdateCategoryInput,
} from '@mizan/contracts'
import { categoryGroupKind, isEssentialCategory, type CategoryGroupKind } from '@mizan/domain'
import type { Db } from '../../db/client.ts'
import { uuidv7 } from '../../lib/uuid.ts'
import type { RequestAuth } from '../../plugins/auth.ts'
import { badRequest, conflict, notFound } from '../../plugins/errors.ts'
import { assertCanWrite } from '../workspace/service.ts'
import {
  countLinesByCategory,
  findCategories,
  findCategoryById,
  findCategoryGroupById,
  findCategoryGroups,
  insertCategory,
  insertCategoryGroup,
  moveLinesToCategory,
  nextCategorySortOrder,
  nextGroupSortOrder,
  updateCategory,
  updateCategoryGroup,
  type CategoryGroupRow,
  type CategoryRow,
} from './repository.ts'

function toCategoryDto(row: CategoryRow, usageCount: number): CategoryDto {
  return {
    id: row.id,
    groupId: row.groupId,
    parentId: row.parentId,
    name: row.name,
    systemKey: row.systemKey,
    renamed: row.nameOverridden,
    isEssential: row.isEssential,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    usageCount,
  }
}

function toGroupDto(row: CategoryGroupRow, children: CategoryDto[]): CategoryGroupDto {
  return {
    id: row.id,
    name: row.name,
    systemKey: row.systemKey,
    renamed: row.nameOverridden,
    // The `category_groups_kind_known` check constraint keeps this in step with the domain.
    kind: row.kind as CategoryGroupKind,
    sortOrder: row.sortOrder,
    categories: children,
  }
}

/**
 * Every group with its categories (PLAN §12).
 *
 * Subcategories are returned alongside their parents rather than nested: a category list is two
 * levels deep at most, and every screen that shows one — the picker, the plan, settings — wants
 * them flat with a `parentId` to indent by.
 *
 * `usageCount` comes from one grouped count over the lines. It is what tells the user whether
 * archiving a category will hide history, and whether a merge has anything to move.
 */
export async function listCategories(
  db: Db,
  auth: RequestAuth,
  { includeArchived }: { includeArchived: boolean },
): Promise<CategoryListResponse> {
  const [groups, rows, usage] = await Promise.all([
    findCategoryGroups(db, auth.workspaceId),
    findCategories(db, auth.workspaceId, { includeArchived }),
    countLinesByCategory(db, auth.workspaceId),
  ])

  const byGroup = new Map<string, CategoryDto[]>()
  for (const row of rows) {
    const dto = toCategoryDto(row, usage.get(row.id) ?? 0)
    const bucket = byGroup.get(row.groupId)
    if (bucket) bucket.push(dto)
    else byGroup.set(row.groupId, [dto])
  }

  return { groups: groups.map((group) => toGroupDto(group, byGroup.get(group.id) ?? [])) }
}

async function loadCategory(db: Db, auth: RequestAuth, id: string): Promise<CategoryRow> {
  const row = await findCategoryById(db, auth.workspaceId, id)
  if (!row) throw notFound('No such category.')
  return row
}

async function loadGroup(db: Db, auth: RequestAuth, id: string): Promise<CategoryGroupRow> {
  const row = await findCategoryGroupById(db, auth.workspaceId, id)
  if (!row) throw notFound('No such category group.')
  return row
}

async function usageOf(db: Db, auth: RequestAuth, id: string): Promise<number> {
  return (await countLinesByCategory(db, auth.workspaceId)).get(id) ?? 0
}

/**
 * The parent a new or moved category may have. Nesting stops at two levels, so a category whose
 * own parent is set cannot become one — otherwise a plan line would have to decide how deep to
 * aggregate (§6).
 */
async function assertUsableParent(
  db: Db,
  auth: RequestAuth,
  parentId: string,
  childId: string | null,
  groupId: string,
): Promise<void> {
  if (parentId === childId) throw badRequest('A category cannot be its own parent.')
  const parent = await loadCategory(db, auth, parentId)
  if (parent.parentId) throw badRequest('Categories go two levels deep, no further.')
  if (parent.archivedAt) throw conflict('That parent category is archived.')
  if (parent.groupId !== groupId) {
    throw badRequest('A subcategory belongs to the same group as its parent.')
  }
}

export async function createCategory(
  db: Db,
  auth: RequestAuth,
  input: CreateCategoryInput,
): Promise<{ category: CategoryDto; created: boolean }> {
  assertCanWrite(auth)

  const id = input.id ?? uuidv7()
  const existing = await findCategoryById(db, auth.workspaceId, id)
  // A repeat of the same client-supplied id is the same category, not a second one (§12).
  if (existing) {
    return { category: toCategoryDto(existing, await usageOf(db, auth, id)), created: false }
  }

  const group = await loadGroup(db, auth, input.groupId)
  if (input.parentId) {
    await assertUsableParent(db, auth, input.parentId, id, group.id)
  }

  const row = await insertCategory(db, {
    id,
    workspaceId: auth.workspaceId,
    groupId: group.id,
    parentId: input.parentId ?? null,
    name: input.name,
    // Essential follows the group's kind unless the user says otherwise.
    isEssential: input.isEssential ?? isEssentialCategory(categoryGroupKind(group.kind)),
    sortOrder: await nextCategorySortOrder(db, auth.workspaceId, group.id),
  })
  if (!row) throw new Error('Category insert returned no row')

  return { category: toCategoryDto(row, 0), created: true }
}

export async function patchCategory(
  db: Db,
  auth: RequestAuth,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryDto> {
  assertCanWrite(auth)
  const current = await loadCategory(db, auth, id)

  const groupId = input.groupId ?? current.groupId
  if (input.groupId !== undefined && input.groupId !== current.groupId) {
    await loadGroup(db, auth, input.groupId)
  }

  if (input.parentId) {
    await assertUsableParent(db, auth, input.parentId, id, groupId)
  }
  // Moving a parent into another group would leave its children behind in the old one.
  if (input.groupId !== undefined && input.groupId !== current.groupId && !current.parentId) {
    const children = (await findCategories(db, auth.workspaceId, { includeArchived: true })).filter(
      (row) => row.parentId === id,
    )
    if (children.length > 0) {
      throw conflict('Move or detach the subcategories before moving this category.')
    }
  }

  const row = await updateCategory(db, auth.workspaceId, id, {
    ...input,
    // A renamed system category shows the user's name from now on, in both languages.
    ...(input.name !== undefined && current.systemKey ? { nameOverridden: true } : {}),
  })
  if (!row) throw notFound('No such category.')
  return toCategoryDto(row, await usageOf(db, auth, id))
}

/**
 * Archives a category. It keeps every line that references it, which is why categories are
 * archived and never deleted (§7). A parent takes its subcategories with it.
 */
export async function setCategoryArchived(
  db: Db,
  auth: RequestAuth,
  id: string,
  archived: boolean,
): Promise<CategoryDto> {
  assertCanWrite(auth)
  const current = await loadCategory(db, auth, id)

  if (archived === (current.archivedAt !== null)) {
    throw conflict(
      archived ? 'That category is already archived.' : 'That category is not archived.',
    )
  }
  if (!archived && current.parentId) {
    const parent = await loadCategory(db, auth, current.parentId)
    if (parent.archivedAt) throw conflict('Restore the parent category first.')
  }

  const archivedAt = archived ? new Date() : null

  const row = await db.transaction(async (tx) => {
    const children = (await findCategories(tx, auth.workspaceId, { includeArchived: true })).filter(
      (candidate) => candidate.parentId === id,
    )
    for (const child of children) {
      // Only follow the parent: a subcategory the user archived on its own stays archived.
      if (archived || child.archivedAt !== null) {
        await updateCategory(tx, auth.workspaceId, child.id, { archivedAt })
      }
    }
    return updateCategory(tx, auth.workspaceId, id, { archivedAt })
  })

  if (!row) throw notFound('No such category.')
  return toCategoryDto(row, await usageOf(db, auth, id))
}

/**
 * Merges one category into another: every line moves across and the source is archived, so a
 * duplicate can be cleaned up without losing the history that pointed at it.
 */
export async function mergeCategory(
  db: Db,
  auth: RequestAuth,
  id: string,
  intoId: string,
): Promise<MergeCategoryResponse> {
  assertCanWrite(auth)
  if (id === intoId) throw badRequest('Pick a different category to merge into.')

  const [source, target] = await Promise.all([
    loadCategory(db, auth, id),
    loadCategory(db, auth, intoId),
  ])
  if (target.archivedAt) throw conflict('That target category is archived.')
  if (source.parentId === null) {
    const children = (await findCategories(db, auth.workspaceId, { includeArchived: true })).filter(
      (row) => row.parentId === id,
    )
    if (children.length > 0) {
      throw conflict('Merge or move the subcategories first.')
    }
  }

  const movedLines = await db.transaction(async (tx) => {
    const moved = await moveLinesToCategory(tx, auth.workspaceId, id, intoId)
    await updateCategory(tx, auth.workspaceId, id, { archivedAt: new Date() })
    return moved
  })

  const after = await loadCategory(db, auth, intoId)
  return { into: toCategoryDto(after, await usageOf(db, auth, intoId)), movedLines }
}

export async function createGroup(
  db: Db,
  auth: RequestAuth,
  input: CreateCategoryGroupInput,
): Promise<{ group: CategoryGroupDto; created: boolean }> {
  assertCanWrite(auth)

  const id = input.id ?? uuidv7()
  const existing = await findCategoryGroupById(db, auth.workspaceId, id)
  if (existing) return { group: toGroupDto(existing, []), created: false }

  const row = await insertCategoryGroup(db, {
    id,
    workspaceId: auth.workspaceId,
    name: input.name,
    kind: categoryGroupKind(input.kind),
    sortOrder: await nextGroupSortOrder(db, auth.workspaceId),
  })
  if (!row) throw new Error('Category group insert returned no row')
  return { group: toGroupDto(row, []), created: true }
}

export async function patchGroup(
  db: Db,
  auth: RequestAuth,
  id: string,
  input: UpdateCategoryGroupInput,
): Promise<CategoryGroupDto> {
  assertCanWrite(auth)
  const current = await loadGroup(db, auth, id)

  const row = await updateCategoryGroup(db, auth.workspaceId, id, {
    ...input,
    ...(input.name !== undefined && current.systemKey ? { nameOverridden: true } : {}),
  })
  if (!row) throw notFound('No such category group.')
  return toGroupDto(row, [])
}

/**
 * Reordering. The ids arrive in the order the user dragged them into; anything left out keeps
 * its place after them. Every id has to belong to this workspace, or the whole call is refused —
 * a partial reorder would leave the list in a state the user never asked for.
 */
export async function reorderCategories(
  db: Db,
  auth: RequestAuth,
  input: ReorderInput,
): Promise<CategoryListResponse> {
  assertCanWrite(auth)

  const rows = await findCategories(db, auth.workspaceId, { includeArchived: true })
  const known = new Set(rows.map((row) => row.id))
  for (const id of input.ids) {
    if (!known.has(id)) throw notFound('No such category.')
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of input.ids.entries()) {
      await updateCategory(tx, auth.workspaceId, id, { sortOrder: index + 1 })
    }
  })

  return listCategories(db, auth, { includeArchived: false })
}

export async function reorderGroups(
  db: Db,
  auth: RequestAuth,
  input: ReorderInput,
): Promise<CategoryListResponse> {
  assertCanWrite(auth)

  const groups = await findCategoryGroups(db, auth.workspaceId)
  const known = new Set(groups.map((group) => group.id))
  for (const id of input.ids) {
    if (!known.has(id)) throw notFound('No such category group.')
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of input.ids.entries()) {
      await updateCategoryGroup(tx, auth.workspaceId, id, { sortOrder: index + 1 })
    }
  })

  return listCategories(db, auth, { includeArchived: false })
}
