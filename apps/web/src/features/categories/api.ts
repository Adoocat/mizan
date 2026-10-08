import {
  categoryGroupSchema,
  categoryListResponseSchema,
  categorySchema,
  mergeCategoryResponseSchema,
  type CreateCategoryGroupInput,
  type CreateCategoryInput,
  type MergeCategoryInput,
  type ReorderInput,
  type UpdateCategoryGroupInput,
  type UpdateCategoryInput,
} from '@mizan/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '../../lib/api-client'
import { transactionKeys } from '../transactions/api'

export const categoryKeys = {
  all: ['categories'] as const,
  list: (includeArchived: boolean) => ['categories', 'list', includeArchived] as const,
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: categoryKeys.list(includeArchived),
    queryFn: ({ signal }) =>
      apiGet(
        `/categories?includeArchived=${includeArchived ? 'true' : 'false'}`,
        categoryListResponseSchema,
        { signal },
      ),
    // The picker and the filters read this on every screen; it changes rarely.
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Every category mutation invalidates the transactions too: a rename changes what the list
 * shows, and a merge moves lines from one category to another.
 */
function useCategoryMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: transactionKeys.all }),
      ])
    },
  })
}

export function useCreateCategory() {
  return useCategoryMutation((input: CreateCategoryInput) =>
    apiPost('/categories', input, categorySchema),
  )
}

export function useUpdateCategory(id: string) {
  return useCategoryMutation((input: UpdateCategoryInput) =>
    apiPatch(`/categories/${id}`, input, categorySchema),
  )
}

export function useSetCategoryArchived(id: string) {
  return useCategoryMutation((archived: boolean) =>
    apiPost(`/categories/${id}/${archived ? 'archive' : 'unarchive'}`, undefined, categorySchema),
  )
}

export function useMergeCategory(id: string) {
  return useCategoryMutation((input: MergeCategoryInput) =>
    apiPost(`/categories/${id}/merge`, input, mergeCategoryResponseSchema),
  )
}

export function useCreateCategoryGroup() {
  return useCategoryMutation((input: CreateCategoryGroupInput) =>
    apiPost('/category-groups', input, categoryGroupSchema),
  )
}

export function useUpdateCategoryGroup(id: string) {
  return useCategoryMutation((input: UpdateCategoryGroupInput) =>
    apiPatch(`/category-groups/${id}`, input, categoryGroupSchema),
  )
}

export function useReorderCategories() {
  return useCategoryMutation((input: ReorderInput) =>
    apiPost('/categories/reorder', input, categoryListResponseSchema),
  )
}
