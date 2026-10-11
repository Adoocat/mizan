import {
  goalListResponseSchema,
  goalResponseSchema,
  goalSchema,
  type AddGoalToPlanInput,
  type CreateContributionInput,
  type CreateGoalInput,
  type UpdateGoalInput,
} from '@mizan/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api-client'
import { planKeys } from '../plan/api'

export const goalKeys = {
  all: ['goals'] as const,
  list: (includeArchived: boolean) => ['goals', 'list', includeArchived] as const,
  detail: (id: string) => ['goals', 'detail', id] as const,
}

export function useGoals(includeArchived = false) {
  return useQuery({
    queryKey: goalKeys.list(includeArchived),
    queryFn: ({ signal }) =>
      apiGet(
        `/goals?includeArchived=${includeArchived ? 'true' : 'false'}`,
        goalListResponseSchema,
        { signal },
      ),
  })
}

export function useGoal(id: string) {
  return useQuery({
    queryKey: goalKeys.detail(id),
    queryFn: ({ signal }) => apiGet(`/goals/${id}`, goalResponseSchema, { signal }),
    enabled: id.length > 0,
  })
}

/**
 * Every goal mutation invalidates the goals **and** the plan.
 *
 * A contribution is a goal line's `actual` and comes off what is available to spend (§10), and
 * "add to plan" writes an allocation — so a page showing the plan while a goal changed underneath
 * it would be stale in a way the user would notice immediately. Transactions are left alone:
 * earmarking money records no transaction at all.
 */
function useGoalMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: goalKeys.all }),
        queryClient.invalidateQueries({ queryKey: planKeys.all }),
      ])
    },
  })
}

export function useCreateGoal() {
  return useGoalMutation((input: CreateGoalInput) => apiPost('/goals', input, goalSchema))
}

export function useUpdateGoal(id: string) {
  return useGoalMutation((input: UpdateGoalInput) => apiPatch(`/goals/${id}`, input, goalSchema))
}

export function useSetGoalArchived(id: string) {
  return useGoalMutation((archived: boolean) =>
    apiPost(`/goals/${id}/${archived ? 'archive' : 'unarchive'}`, undefined, goalSchema),
  )
}

/** Earmarks money for a goal, or releases it back: the amount is signed (flow F8). */
export function useContribute(id: string) {
  return useGoalMutation((input: CreateContributionInput) =>
    apiPost(`/goals/${id}/contributions`, input, goalResponseSchema),
  )
}

export function useRemoveContribution(id: string) {
  return useGoalMutation((contributionId: string) =>
    apiDelete(`/goals/${id}/contributions/${contributionId}`, goalResponseSchema),
  )
}

/** "Add to plan" (§9): gives the goal an allocation in the month being planned. */
export function useAddGoalToPlan(id: string) {
  return useGoalMutation((input: AddGoalToPlanInput) =>
    apiPost(`/goals/${id}/plan-line`, input, goalResponseSchema),
  )
}
