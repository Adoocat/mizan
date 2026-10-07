import { useParams } from '@tanstack/react-router'
import { z } from 'zod'

const paramsSchema = z.object({ accountId: z.uuid() })

/**
 * The account id from the URL, validated.
 *
 * The router types its params as `any`, and the segment is whatever the address bar holds, so it
 * is checked here rather than trusted. A hand-edited URL yields `null`, which the page shows as
 * "no such account" instead of sending a malformed id to the API.
 */
export function useAccountIdParam(): string | null {
  const raw: unknown = useParams({ strict: false })
  const result = paramsSchema.safeParse(raw)
  return result.success ? result.data.accountId : null
}
