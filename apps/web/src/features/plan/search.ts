import { isPlainDate } from '@mizan/domain'
import { z } from 'zod'

/**
 * The Plan page's URL (PLAN §13: "month switcher").
 *
 * The month is the start date of the plan period — not necessarily the 1st (decision D3) — so a
 * month can be bookmarked or shared, and Back steps through the months the user looked at.
 * Without it the API resolves the current month from the clock.
 */
export const planSearchSchema = z.object({
  month: z.string().refine(isPlainDate).optional().catch(undefined),
})

export type PlanSearch = z.infer<typeof planSearchSchema>
