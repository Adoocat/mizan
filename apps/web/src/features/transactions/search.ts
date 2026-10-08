import { TRANSACTION_VIEWS } from '@mizan/contracts'
import { isPlainDate } from '@mizan/domain'
import { z } from 'zod'

/**
 * The Transactions page's URL (PLAN §13: "URL filters").
 *
 * Every filter lives in the address bar, so a filtered view can be bookmarked, shared or reloaded
 * — and the browser's Back button steps through filters the way a user expects. The names match
 * the API's query parameters exactly, so there is no translation layer between the two.
 */
export const transactionsSearchSchema = z.object({
  view: z.enum(TRANSACTION_VIEWS).catch('all'),
  q: z.string().trim().max(120).optional().catch(undefined),
  from: z.string().refine(isPlainDate).optional().catch(undefined),
  to: z.string().refine(isPlainDate).optional().catch(undefined),
  /** Repeated in the URL (`?accountId=a&accountId=b`), an array here. */
  accountId: z.array(z.uuid()).optional().catch(undefined),
  categoryId: z.array(z.uuid()).optional().catch(undefined),
})

export type TransactionsSearch = z.infer<typeof transactionsSearchSchema>
