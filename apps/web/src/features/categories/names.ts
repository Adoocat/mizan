import type { CategoryDto, CategoryGroupDto, CategoryListResponse } from '@mizan/contracts'
import { compareCategoryGroupKinds } from '@mizan/domain'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * The name to show for a category (ADR 0010).
 *
 * A category the default template seeded carries a `systemKey`, and its name comes from i18next —
 * so "Food & groceries" reads "Market" in Turkish without the database holding two names. Once
 * the user renames it the stored name wins, in both languages, because it is theirs. A category
 * they created has no key and always shows its stored name.
 */
export function useCategoryName() {
  const { t } = useTranslation()
  return (category: Pick<CategoryDto, 'name' | 'systemKey' | 'renamed'>): string =>
    category.systemKey && !category.renamed
      ? t(`categories.${category.systemKey}`, { defaultValue: category.name })
      : category.name
}

/** The same, for a group: `categories.groups.essentials`. */
export function useCategoryGroupName() {
  const { t } = useTranslation()
  return (group: Pick<CategoryGroupDto, 'name' | 'systemKey' | 'renamed'>): string =>
    group.systemKey && !group.renamed
      ? t(`categories.groups.${group.systemKey}`, { defaultValue: group.name })
      : group.name
}

export interface CategoryOption {
  id: string
  /** Already translated, and ready to search against. */
  label: string
  groupId: string
  groupLabel: string
  groupKind: CategoryGroupDto['kind']
  /** A subcategory is shown indented under its parent. */
  depth: 0 | 1
  archived: boolean
}

/**
 * Flattens the category tree into the list every picker and filter menu shows: groups in plan
 * order, parents in their own order, each parent followed by its children.
 */
export function useCategoryOptions(data: CategoryListResponse | undefined): CategoryOption[] {
  const categoryName = useCategoryName()
  const groupName = useCategoryGroupName()

  return useMemo(() => {
    if (!data) return []
    const groups = [...data.groups].sort((a, b) => compareCategoryGroupKinds(a.kind, b.kind))

    return groups.flatMap((group) => {
      const groupLabel = groupName(group)
      const parents = group.categories.filter((category) => category.parentId === null)

      const option = (category: CategoryDto, depth: 0 | 1): CategoryOption => ({
        id: category.id,
        label: categoryName(category),
        groupId: group.id,
        groupLabel,
        groupKind: group.kind,
        depth,
        archived: category.archivedAt !== null,
      })

      return parents.flatMap((parent) => [
        option(parent, 0),
        ...group.categories
          .filter((category) => category.parentId === parent.id)
          .map((child) => option(child, 1)),
      ])
    })
    // The name helpers close over `t`, which changes with the language; `data` covers the rest.
  }, [data, categoryName, groupName])
}

/** Looks an option up by id, for showing the name on a transaction row. */
export function optionsById(options: readonly CategoryOption[]): Map<string, CategoryOption> {
  return new Map(options.map((option) => [option.id, option]))
}
