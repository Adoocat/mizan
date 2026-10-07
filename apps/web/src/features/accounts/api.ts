import {
  accountDetailResponseSchema,
  accountListResponseSchema,
  accountSchema,
  reconcileAccountResponseSchema,
  type CreateAccountInput,
  type ReconcileAccountInput,
  type UpdateAccountInput,
} from '@mizan/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '../../lib/api-client'

export const accountKeys = {
  all: ['accounts'] as const,
  list: (includeArchived: boolean) => ['accounts', 'list', includeArchived] as const,
  detail: (id: string) => ['accounts', 'detail', id] as const,
}

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: accountKeys.list(includeArchived),
    queryFn: ({ signal }) =>
      apiGet(
        `/accounts?includeArchived=${includeArchived ? 'true' : 'false'}`,
        accountListResponseSchema,
        { signal },
      ),
  })
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: accountKeys.detail(id),
    queryFn: ({ signal }) => apiGet(`/accounts/${id}`, accountDetailResponseSchema, { signal }),
    // The caller passes an empty id when the URL held no valid one; it renders "not found" instead.
    enabled: id.length > 0,
  })
}

/** Every mutation invalidates the whole accounts tree: a balance change moves the totals too. */
function useAccountMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.all }),
  })
}

export function useCreateAccount() {
  return useAccountMutation((input: CreateAccountInput) =>
    apiPost('/accounts', input, accountSchema),
  )
}

export function useUpdateAccount(id: string) {
  return useAccountMutation((input: UpdateAccountInput) =>
    apiPatch(`/accounts/${id}`, input, accountSchema),
  )
}

export function useSetAccountArchived(id: string) {
  return useAccountMutation((archived: boolean) =>
    apiPost(`/accounts/${id}/${archived ? 'archive' : 'unarchive'}`, undefined, accountSchema),
  )
}

export function useReconcileAccount(id: string) {
  return useAccountMutation((input: ReconcileAccountInput) =>
    apiPost(`/accounts/${id}/reconcile`, input, reconcileAccountResponseSchema),
  )
}
