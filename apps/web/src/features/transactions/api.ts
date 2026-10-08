import {
  transactionListResponseSchema,
  transactionSchema,
  type CreateTransactionInput,
  type TransactionListQuery,
  type UpdateTransactionInput,
} from '@mizan/contracts'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPut } from '../../lib/api-client'
import { accountKeys } from '../accounts/api'

/** The filters, in the shape the page holds them (and the URL carries them). */
export interface TransactionFilters {
  view: TransactionListQuery['view']
  q?: string | undefined
  from?: string | undefined
  to?: string | undefined
  accountId?: string[] | undefined
  categoryId?: string[] | undefined
  minAmount?: string | undefined
  maxAmount?: string | undefined
}

export const transactionKeys = {
  all: ['transactions'] as const,
  list: (filters: TransactionFilters) => ['transactions', 'list', filters] as const,
}

/**
 * Builds the query string the API parses. Repeated parameters rather than a joined list, so
 * `?accountId=a&accountId=b` round-trips through the URL bar unchanged.
 */
export function transactionQueryString(filters: TransactionFilters): string {
  const params = new URLSearchParams()
  if (filters.view !== 'all') params.set('view', filters.view)
  if (filters.q) params.set('q', filters.q)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.minAmount) params.set('minAmount', filters.minAmount)
  if (filters.maxAmount) params.set('maxAmount', filters.maxAmount)
  for (const id of filters.accountId ?? []) params.append('accountId', id)
  for (const id of filters.categoryId ?? []) params.append('categoryId', id)
  return params.toString()
}

/**
 * One page at a time, continued by the cursor the API hands back ("Load earlier" in the mockup).
 * The summary is the same on every page — it covers the whole filtered set — so the first page's
 * is the one the tiles read.
 */
export function useTransactions(filters: TransactionFilters) {
  const query = transactionQueryString(filters)
  return useInfiniteQuery({
    queryKey: transactionKeys.list(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams(query)
      if (pageParam) params.set('cursor', pageParam)
      const search = params.toString()
      return apiGet(`/transactions${search ? `?${search}` : ''}`, transactionListResponseSchema, {
        signal,
      })
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: (data) => ({
      transactions: data.pages.flatMap((page) => page.transactions),
      summary: data.pages[0]!.summary,
    }),
  })
}

/**
 * Every write invalidates the transactions *and* the accounts: an expense moves a balance, and
 * the Accounts page would otherwise keep showing the old one.
 */
function useTransactionMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionKeys.all }),
        queryClient.invalidateQueries({ queryKey: accountKeys.all }),
      ])
    },
  })
}

export function useCreateTransaction() {
  return useTransactionMutation((input: CreateTransactionInput) =>
    apiPost('/transactions', input, transactionSchema),
  )
}

export function useReplaceTransaction(id: string) {
  return useTransactionMutation((input: UpdateTransactionInput) =>
    apiPut(`/transactions/${id}`, input, transactionSchema),
  )
}

export function useDeleteTransaction() {
  return useTransactionMutation((id: string) => apiDelete(`/transactions/${id}`, transactionSchema))
}

/** The Undo in the toast that follows a delete. */
export function useRestoreTransaction() {
  return useTransactionMutation((id: string) =>
    apiPost(`/transactions/${id}/restore`, undefined, transactionSchema),
  )
}
