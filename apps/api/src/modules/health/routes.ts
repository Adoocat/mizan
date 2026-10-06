import { healthResponseSchema } from '@mizan/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../db/client.ts'

export const healthRoutes: FastifyPluginAsyncZod<{ database: Database }> = async (
  app,
  { database },
) => {
  app.get(
    '/health',
    {
      schema: {
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      const databaseOk = await database.ping()
      const status = databaseOk ? 'ok' : 'error'
      return reply.status(databaseOk ? 200 : 503).send({ status, checks: { database: status } })
    },
  )
}
