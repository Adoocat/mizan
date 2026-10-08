import { CATEGORY_GROUP_KINDS, type CategoryGroupKind } from '@mizan/domain'
import { z } from 'zod'

export const categoryGroupKindSchema = z.enum(
  CATEGORY_GROUP_KINDS as unknown as [CategoryGroupKind, ...CategoryGroupKind[]],
)

export const categoryNameSchema = z.string().trim().min(1).max(60)

/**
 * A category as the API returns it (PLAN §6).
 *
 * `systemKey` is set on the categories the default template seeds and is what the UI translates:
 * a system category reads "Food & groceries" in English and "Market" in Turkish without storing
 * two names. Renaming one keeps the key — the user's name then wins — and a category the user
 * created has no key at all. `archivedAt` rather than deletion, because history has to stay
 * readable (§7).
 */
export const categorySchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  parentId: z.uuid().nullable(),
  name: categoryNameSchema,
  systemKey: z.string().nullable(),
  /** Whether the user renamed a seeded category, so the UI shows the stored name instead. */
  renamed: z.boolean(),
  isEssential: z.boolean(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable(),
  /** How many transaction lines reference it: what archiving and merging have to preserve. */
  usageCount: z.number().int().min(0),
})
export type CategoryDto = z.infer<typeof categorySchema>

export const categoryGroupSchema = z.object({
  id: z.uuid(),
  name: categoryNameSchema,
  systemKey: z.string().nullable(),
  renamed: z.boolean(),
  kind: categoryGroupKindSchema,
  sortOrder: z.number().int(),
  categories: z.array(categorySchema),
})
export type CategoryGroupDto = z.infer<typeof categoryGroupSchema>

export const categoryListResponseSchema = z.object({
  groups: z.array(categoryGroupSchema),
})
export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>

/**
 * `id` is optional and client-supplied, which makes the create idempotent the same way accounts
 * are (§12). A subcategory passes `parentId`; nesting stops at two levels.
 */
export const createCategorySchema = z.object({
  id: z.uuid().optional(),
  groupId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
  name: categoryNameSchema,
  isEssential: z.boolean().optional(),
})
export type CreateCategoryInput = z.infer<typeof createCategorySchema>

export const updateCategorySchema = z
  .object({
    name: categoryNameSchema,
    groupId: z.uuid(),
    parentId: z.uuid().nullable(),
    isEssential: z.boolean(),
    sortOrder: z.number().int().min(0).max(9999),
  })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  })
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

export const createCategoryGroupSchema = z.object({
  id: z.uuid().optional(),
  name: categoryNameSchema,
  kind: categoryGroupKindSchema,
})
export type CreateCategoryGroupInput = z.infer<typeof createCategoryGroupSchema>

export const updateCategoryGroupSchema = z
  .object({
    name: categoryNameSchema,
    sortOrder: z.number().int().min(0).max(9999),
  })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  })
export type UpdateCategoryGroupInput = z.infer<typeof updateCategoryGroupSchema>

/**
 * Merging moves every transaction line from one category onto another and archives the source.
 * It is how a duplicate gets cleaned up without losing the history that referenced it.
 */
export const mergeCategorySchema = z.object({
  intoId: z.uuid(),
})
export type MergeCategoryInput = z.infer<typeof mergeCategorySchema>

export const mergeCategoryResponseSchema = z.object({
  /** The category that absorbed the other, with its new usage count. */
  into: categorySchema,
  /** How many transaction lines moved. */
  movedLines: z.number().int().min(0),
})
export type MergeCategoryResponse = z.infer<typeof mergeCategoryResponseSchema>

/** Reordering a group's categories, or the groups themselves: ids in the order they should show. */
export const reorderSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
})
export type ReorderInput = z.infer<typeof reorderSchema>
