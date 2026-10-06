import { z } from 'zod'

export const checkStatusSchema = z.enum(['ok', 'error'])

export const healthResponseSchema = z.object({
  status: checkStatusSchema,
  checks: z.object({
    database: checkStatusSchema,
  }),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
