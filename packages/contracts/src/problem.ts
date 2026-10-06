import { z } from 'zod'

/** RFC 9457 problem details, as returned by every API error. */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
})

export type Problem = z.infer<typeof problemSchema>

export const PROBLEM_CONTENT_TYPE = 'application/problem+json'
