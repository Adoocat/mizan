import { useRouterState } from '@tanstack/react-router'
import { z } from 'zod'

/**
 * Query parameters the credential screens read. Both the router's `validateSearch` and the hooks
 * below use these schemas, so a hand-edited URL can never reach a component as an unchecked
 * value — and the components get a real type instead of the router's `any`.
 */
export const signInSearchSchema = z.object({
  /** Where to go once signed in, remembered by the session gate. Internal paths only. */
  redirect: z
    .string()
    .refine((value) => value.startsWith('/') && !value.startsWith('//'))
    .optional()
    .catch(undefined),
})

export const resetPasswordSearchSchema = z.object({
  token: z.string().min(1).optional().catch(undefined),
  /** The API's reset callback sends `?error=INVALID_TOKEN` for a stale link. */
  error: z.string().optional().catch(undefined),
})

function useValidatedSearch<Schema extends z.ZodType>(schema: Schema): z.infer<Schema> {
  // The router types `location.search` as `any`; the schema is what gives it a shape.
  const raw: unknown = useRouterState({ select: (state): unknown => state.location.search })
  return schema.parse(raw ?? {})
}

export const useSignInSearch = () => useValidatedSearch(signInSearchSchema)
export const useResetPasswordSearch = () => useValidatedSearch(resetPasswordSearchSchema)
