import { problemSchema, type Problem } from '@mizan/contracts'
import type { z } from 'zod'

export const API_BASE = '/api/v1'

export class ApiError extends Error {
  override name = 'ApiError'
  readonly status: number
  readonly problem: Problem | undefined

  constructor(status: number, problem: Problem | undefined) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`)
    this.status = status
    this.problem = problem
  }

  /** The message to show a user: the server's `detail`, never an internal title or stack. */
  get detail(): string | undefined {
    return this.problem?.detail
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

async function send<Schema extends z.ZodType>(
  method: string,
  path: string,
  schema: Schema,
  body: unknown,
  options: RequestOptions,
): Promise<z.infer<Schema>> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: options.signal ?? null,
  })
  const payload = await readJson(response)

  if (!response.ok && !options.acceptStatuses?.includes(response.status)) {
    const problem = problemSchema.safeParse(payload)
    throw new ApiError(response.status, problem.success ? problem.data : undefined)
  }

  return schema.parse(payload)
}

/** GET a JSON resource and validate it against a shared contract schema. */
export function apiGet<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  options: RequestOptions = {},
): Promise<z.infer<Schema>> {
  return send('GET', path, schema, undefined, options)
}

export function apiPost<Schema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: Schema,
  options: RequestOptions = {},
): Promise<z.infer<Schema>> {
  return send('POST', path, schema, body, options)
}

export function apiPatch<Schema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: Schema,
  options: RequestOptions = {},
): Promise<z.infer<Schema>> {
  return send('PATCH', path, schema, body, options)
}

export function apiPut<Schema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: Schema,
  options: RequestOptions = {},
): Promise<z.infer<Schema>> {
  return send('PUT', path, schema, body, options)
}

export function apiDelete<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  options: RequestOptions = {},
): Promise<z.infer<Schema>> {
  return send('DELETE', path, schema, undefined, options)
}
