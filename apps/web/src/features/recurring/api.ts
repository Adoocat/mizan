import {
  confirmOccurrenceResponseSchema,
  occurrenceResponseSchema,
  recurringListResponseSchema,
  recurringRuleSchema,
  ruleOccurrencesResponseSchema,
  upcomingResponseSchema,
  type ConfirmOccurrenceInput,
  type CreateRecurringRuleInput,
  type EndRecurringRuleInput,
  type OverrideOccurrenceInput,
  type PauseRecurringRuleInput,
  type UpdateRecurringRuleInput,
} from '@mizan/contracts'
import type { PlainDate } from '@mizan/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api-client'
import { accountKeys } from '../accounts/api'
import { goalKeys } from '../goals/api'
import { planKeys } from '../plan/api'
import { transactionKeys } from '../transactions/api'

export const recurringKeys = {
  all: ['recurring'] as const,
  list: () => ['recurring', 'list'] as const,
  occurrences: (id: string, from?: string, to?: string) =>
    ['recurring', 'occurrences', id, from ?? null, to ?? null] as const,
  upcoming: (days: number) => ['upcoming', days] as const,
}

export function useRecurringRules() {
  return useQuery({
    queryKey: recurringKeys.list(),
    queryFn: ({ signal }) => apiGet('/recurring', recurringListResponseSchema, { signal }),
  })
}

/** One rule's occurrences, settled ones included: the series as it actually went. */
export function useRuleOccurrences(id: string, range: { from?: PlainDate; to?: PlainDate } = {}) {
  const query = new URLSearchParams()
  if (range.from) query.set('from', range.from)
  if (range.to) query.set('to', range.to)
  const search = query.size > 0 ? `?${query.toString()}` : ''

  return useQuery({
    queryKey: recurringKeys.occurrences(id, range.from, range.to),
    queryFn: ({ signal }) =>
      apiGet(`/recurring/${id}/occurrences${search}`, ruleOccurrencesResponseSchema, { signal }),
    enabled: id.length > 0,
  })
}

export function useUpcoming(days = 7) {
  return useQuery({
    queryKey: recurringKeys.upcoming(days),
    queryFn: ({ signal }) => apiGet(`/upcoming?days=${days}`, upcomingResponseSchema, { signal }),
  })
}

/**
 * Every recurring mutation invalidates nearly everything.
 *
 * A confirmed occurrence writes a transaction, moves an account balance, counts against a plan
 * line and — for a transfer rule with a goal — records a contribution (§11, flow F8). A page
 * showing any of those while a rule changed underneath it would be stale in a way the user would
 * notice immediately, so the cheap and honest thing is to refetch them all.
 */
function useRecurringMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: recurringKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['upcoming'] }),
        queryClient.invalidateQueries({ queryKey: planKeys.all }),
        queryClient.invalidateQueries({ queryKey: transactionKeys.all }),
        queryClient.invalidateQueries({ queryKey: accountKeys.all }),
        queryClient.invalidateQueries({ queryKey: goalKeys.all }),
      ])
    },
  })
}

export function useCreateRule() {
  return useRecurringMutation((input: CreateRecurringRuleInput) =>
    apiPost('/recurring', input, recurringRuleSchema),
  )
}

export function useUpdateRule(id: string) {
  return useRecurringMutation((input: UpdateRecurringRuleInput) =>
    apiPatch(`/recurring/${id}`, input, recurringRuleSchema),
  )
}

export function usePauseRule(id: string) {
  return useRecurringMutation((input: PauseRecurringRuleInput) =>
    apiPost(`/recurring/${id}/pause`, input, recurringRuleSchema),
  )
}

export function useResumeRule(id: string) {
  return useRecurringMutation(() =>
    apiPost(`/recurring/${id}/resume`, undefined, recurringRuleSchema),
  )
}

export function useEndRule(id: string) {
  return useRecurringMutation((input: EndRecurringRuleInput) =>
    apiPost(`/recurring/${id}/end`, input, recurringRuleSchema),
  )
}

/**
 * Deletes a rule. The API answers 204 with no body, which is what the schema has to expect: a
 * `null` schema would reject the empty body and the delete would look like a failure.
 */
export function useDeleteRule(id: string) {
  return useRecurringMutation(() => apiDelete(`/recurring/${id}`, z.undefined()))
}

/**
 * Records that the money moved (flow F6). Idempotent: a second tap answers `alreadyPosted`.
 *
 * `occurrenceDate` is the occurrence's series date, which addresses it in the URL. `date` in the
 * body is the day the money actually moved, and the two differ when a payment is confirmed late.
 */
export function useConfirmOccurrence(id: string) {
  return useRecurringMutation(
    ({ occurrenceDate, ...body }: ConfirmOccurrenceInput & { occurrenceDate: PlainDate }) =>
      apiPost(
        `/recurring/${id}/occurrences/${occurrenceDate}/confirm`,
        body,
        confirmOccurrenceResponseSchema,
      ),
  )
}

export function useSkipOccurrence(id: string) {
  return useRecurringMutation((date: PlainDate) =>
    apiPost(`/recurring/${id}/occurrences/${date}/skip`, undefined, occurrenceResponseSchema),
  )
}

export function useOverrideOccurrence(id: string) {
  return useRecurringMutation((input: OverrideOccurrenceInput & { originalDate: PlainDate }) =>
    apiPost(
      `/recurring/${id}/occurrences/${input.originalDate}/override`,
      {
        ...(input.date ? { date: input.date } : {}),
        ...(input.amount ? { amount: input.amount } : {}),
      },
      occurrenceResponseSchema,
    ),
  )
}

/** Un-skips an occurrence, or drops an override: back to what the schedule said. */
export function useClearOccurrenceException(id: string) {
  return useRecurringMutation((date: PlainDate) =>
    apiDelete(`/recurring/${id}/occurrences/${date}/exception`, occurrenceResponseSchema),
  )
}
