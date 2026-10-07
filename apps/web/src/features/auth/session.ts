import { meResponseSchema, type MeResponse } from '@mizan/contracts'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError, apiGet, apiPatch } from '../../lib/api-client'

export const sessionQueryKey = ['session'] as const

/**
 * `GET /api/v1/me` is the single source of session truth: it answers who is signed in *and*
 * which workspace they act in, which every other screen needs. A 401 is not an error — it is the
 * signed-out answer — so it resolves to `null`.
 */
async function fetchSession(signal: AbortSignal): Promise<MeResponse | null> {
  try {
    return await apiGet('/me', meResponseSchema, { signal })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: ({ signal }) => fetchSession(signal),
    // Signing in or out changes this, and both paths invalidate it explicitly.
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** The signed-in user and workspace, for a component that only renders behind the guard. */
export function useCurrentSession(): MeResponse {
  const { data } = useSession()
  if (!data) throw new Error('useCurrentSession used outside a signed-in route')
  return data
}

export function invalidateSession(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: sessionQueryKey })
}

/** Drops every cached query. Used on sign-out so no workspace data survives into the next session. */
export function clearSession(queryClient: QueryClient) {
  queryClient.clear()
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name?: string; locale?: 'en' | 'tr' }) =>
      apiPatch('/me', input, meResponseSchema),
    onSuccess: (data) => queryClient.setQueryData(sessionQueryKey, data),
  })
}

export function useUpdateWorkspaceSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name?: string; periodStartDay?: number; baseCurrency?: string }) =>
      apiPatch('/workspace/settings', input, meResponseSchema),
    onSuccess: (data) => queryClient.setQueryData(sessionQueryKey, data),
  })
}
