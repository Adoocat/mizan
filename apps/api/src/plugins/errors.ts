import { PROBLEM_CONTENT_TYPE, type Problem } from '@mizan/contracts'
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
}

function titleFor(status: number): string {
  return STATUS_TITLES[status] ?? (status >= 500 ? 'Internal Server Error' : 'Error')
}

/**
 * An error a service raises on purpose, with the status and the message the client should see.
 * Anything else becomes a bare 500 with no detail.
 */
export class ApiProblem extends Error {
  override name = 'ApiProblem'
  readonly status: number

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

export const notFound = (detail = 'Not found.') => new ApiProblem(404, detail)
export const conflict = (detail: string) => new ApiProblem(409, detail)
export const badRequest = (detail: string) => new ApiProblem(400, detail)
export const forbidden = (detail = 'You may not do that.') => new ApiProblem(403, detail)

/** Sends an RFC 9457 problem+json body. Route handlers should `return` the result. */
export function problem(
  reply: FastifyReply,
  request: FastifyRequest,
  details: Omit<Problem, 'type' | 'title'>,
) {
  const body: Problem = {
    type: 'about:blank',
    title: titleFor(details.status),
    ...details,
    requestId: request.id,
  }
  return reply.status(details.status).type(PROBLEM_CONTENT_TYPE).send(body)
}

/** Every error leaves the API as RFC 9457 problem+json. Internal details are logged, never sent. */
export function registerErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return problem(reply, request, {
        status: 400,
        detail: 'The request is invalid.',
        // Paths and messages only. Input values are never echoed back or logged.
        errors: error.validation.map((issue) => ({
          path: issue.instancePath || '/',
          message: issue.message ?? 'Invalid value',
        })),
      })
    }

    if (error instanceof ApiProblem) {
      return problem(reply, request, { status: error.status, detail: error.message })
    }

    const status =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500

    if (status >= 500) {
      request.log.error({ err: error }, 'request failed')
      return problem(reply, request, { status })
    }

    return problem(reply, request, { status, detail: error.message })
  })

  app.setNotFoundHandler((request, reply) => problem(reply, request, { status: 404 }))
}
