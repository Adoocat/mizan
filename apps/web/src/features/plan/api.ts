import {
  copyPlanResponseSchema,
  planResponseSchema,
  type CopyPlanInput,
  type CoverOverspendInput,
  type PlanResponse,
  type CreatePlanIncomeItemInput,
  type UpdatePlanIncomeItemInput,
  type UpsertPlanLineInput,
} from '@mizan/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../lib/api-client'

export const planKeys = {
  all: ['plan'] as const,
  /** `null` is the current month, resolved by the API from the workspace's clock. */
  month: (start: string | null) => ['plan', 'month', start] as const,
}

const path = (start: string | null) => `/plans/${start ?? 'current'}`

/**
 * One month's plan (PLAN §12).
 *
 * The month lives in the URL, so moving between months is navigation: each one gets its own
 * cache entry and going back to September is instant.
 */
export function usePlan(start: string | null) {
  return useQuery({
    queryKey: planKeys.month(start),
    queryFn: ({ signal }) => apiGet(path(start), planResponseSchema, { signal }),
  })
}

/**
 * Every plan mutation answers with the whole month, so the response is written straight into the
 * cache: the totals, the bar and every remainder update together, with no refetch in between
 * that could show the page half-updated.
 *
 * Other months are invalidated rather than updated — a copy changes the month it copied into,
 * and nothing else — and the transactions are left alone, since allocating money moves none.
 */
function usePlanMutation<Input, Output>(
  start: string | null,
  mutationFn: (input: Input) => Promise<Output>,
  select: (output: Output) => PlanResponse = (output) => output as PlanResponse,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async (output) => {
      queryClient.setQueryData(planKeys.month(start), select(output))
      // Every other cached month may have changed meaning — the month a copy read from, or
      // `current` while a dated month is on screen — so it is refetched rather than guessed at.
      await queryClient.invalidateQueries({
        queryKey: planKeys.all,
        predicate: (query) => query.queryKey[2] !== start,
      })
    },
  })
}

/** Sets what a line is allocated, creating or removing it as the amount requires (flow F3). */
export function useUpsertPlanLine(start: string | null) {
  return usePlanMutation(start, (input: UpsertPlanLineInput) =>
    apiPut(`${path(start)}/lines`, input, planResponseSchema),
  )
}

export function useCreateIncomeItem(start: string | null) {
  return usePlanMutation(start, (input: CreatePlanIncomeItemInput) =>
    apiPost(`${path(start)}/income-items`, input, planResponseSchema),
  )
}

export function useUpdateIncomeItem(start: string | null) {
  return usePlanMutation(start, ({ id, ...input }: UpdatePlanIncomeItemInput & { id: string }) =>
    apiPatch(`${path(start)}/income-items/${id}`, input, planResponseSchema),
  )
}

export function useDeleteIncomeItem(start: string | null) {
  return usePlanMutation(start, (id: string) =>
    apiDelete(`${path(start)}/income-items/${id}`, planResponseSchema),
  )
}

/**
 * Records a cover: which line paid for an overspend (§10, decision D4).
 *
 * The overspend has already come off what can be spent, so this does not change the total — it
 * says where the money came from, and puts the source line's remainder where it belongs.
 */
export function useCoverOverspend(start: string | null) {
  return usePlanMutation(start, (input: CoverOverspendInput) =>
    apiPost(`${path(start)}/moves`, input, planResponseSchema),
  )
}

export function useUndoCover(start: string | null) {
  return usePlanMutation(start, (id: string) =>
    apiDelete(`${path(start)}/moves/${id}`, planResponseSchema),
  )
}

/** Copies an earlier month's allocations into this one ("Copy from September" in the mockup). */
export function useCopyPlan(start: string | null) {
  return usePlanMutation(
    start,
    ({ from, ...input }: CopyPlanInput & { from: string }) =>
      apiPost(`${path(start)}/copy-from/${from}`, input, copyPlanResponseSchema),
    (output) => output.plan,
  )
}
