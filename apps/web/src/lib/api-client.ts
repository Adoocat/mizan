import { problemSchema, type Problem } from '@mizan/contracts'
import type { z } from 'zod'

export const API_BASE = '/api/v1'

export class ApiError extends Error {
  override name = 'ApiError'
  readonly status: number
  readonly problem: Problem | undefined

  constructor(status: number, problem: Problem | undefined) {
    super(problem?.title ?? `Request failed with status ${status}`)
    this.status = status
    this.problem = problem
  }
}

interface RequestOptions {
  signal?: AbortSignal | undefined
  /** Non-2xx statuses whose body should still be parsed with the success schema. */
  acceptStatuses?: readonly number[]
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/** GET a JSON resource and validate it against a shared contract schema. */
export async function apiGet<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  options: RequestOptions = {},
): Promise<z.infer<Schema>> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    signal: options.signal ?? null,
  })
  const body = await readJson(response)

  if (!response.ok && !options.acceptStatuses?.includes(response.status)) {
    const problem = problemSchema.safeParse(body)
    throw new ApiError(response.status, problem.success ? problem.data : undefined)
  }

  return schema.parse(body)
}
