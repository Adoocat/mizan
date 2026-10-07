import type { FastifyInstance } from 'fastify'

/**
 * JSON body parsing that tolerates an empty body.
 *
 * Fastify's default parser answers 400 when `content-type: application/json` arrives with nothing
 * after it. That is a problem for the action endpoints — `POST /accounts/:id/archive` and the like
 * — which take no body at all: any client that sets a JSON content type by default, including
 * `fetch` wrappers and test harnesses, would be refused for a request that is perfectly valid.
 *
 * An empty body therefore parses to `undefined`, and a route either has no body schema or
 * declares the body optional. Malformed JSON still fails with 400, as before.
 */
export function registerBodyParsing(app: FastifyInstance) {
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body: string | Buffer, done) => {
      const text = typeof body === 'string' ? body : body.toString('utf8')
      if (text.trim() === '') {
        done(null, undefined)
        return
      }
      try {
        done(null, JSON.parse(text))
      } catch {
        // Never echo the body back: it can carry amounts or notes (PLAN §15).
        const error = Object.assign(new Error('The request body is not valid JSON.'), {
          statusCode: 400,
        })
        done(error, undefined)
      }
    },
  )
}
