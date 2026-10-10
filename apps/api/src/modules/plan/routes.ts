import {
  copyPlanResponseSchema,
  copyPlanSchema,
  createPlanIncomeItemSchema,
  planResponseSchema,
  plainDateSchema,
  updatePlanIncomeItemSchema,
  upsertPlanLineSchema,
} from '@mizan/contracts'
import type { Clock } from '@mizan/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { requireAuth } from '../../plugins/require-auth.ts'
import {
  copyPlan,
  createIncomeItem,
  patchIncomeItem,
  readPlan,
  removeIncomeItem,
  upsertPlanLine,
} from './service.ts'

/**
 * A month is addressed by its start date, which is the day the user's plan month begins — not
 * necessarily the 1st (decision D3). `current` resolves it from the clock instead.
 */
const startParamsSchema = z.object({ start: plainDateSchema })
const copyParamsSchema = z.object({ start: plainDateSchema, from: plainDateSchema })
const itemParamsSchema = z.object({ start: plainDateSchema, id: z.uuid() })

/** `/plans` (PLAN §12). */
export const planRoutes: FastifyPluginAsyncZod<{ database: Database; clock: Clock }> = async (
  app,
  { database, clock },
) => {
  app.addHook('preHandler', app.requireSession)

  const deps = { clock }

  app.get(
    '/plans/current',
    { schema: { response: { 200: planResponseSchema } } },
    async (request) => readPlan(database.db, requireAuth(request), deps),
  )

  app.get(
    '/plans/:start',
    { schema: { params: startParamsSchema, response: { 200: planResponseSchema } } },
    async (request) => readPlan(database.db, requireAuth(request), deps, request.params.start),
  )

  app.put(
    '/plans/:start/lines',
    {
      schema: {
        params: startParamsSchema,
        body: upsertPlanLineSchema,
        response: { 200: planResponseSchema },
      },
    },
    async (request) =>
      upsertPlanLine(database.db, requireAuth(request), deps, request.params.start, request.body),
  )

  app.post(
    '/plans/:start/income-items',
    {
      schema: {
        params: startParamsSchema,
        body: createPlanIncomeItemSchema,
        response: { 200: planResponseSchema, 201: planResponseSchema },
      },
    },
    async (request, reply) => {
      const { plan, created } = await createIncomeItem(
        database.db,
        requireAuth(request),
        deps,
        request.params.start,
        request.body,
      )
      // A repeat of the same client id is not a new item, so it answers 200, not 201.
      return reply.status(created ? 201 : 200).send(plan)
    },
  )

  app.patch(
    '/plans/:start/income-items/:id',
    {
      schema: {
        params: itemParamsSchema,
        body: updatePlanIncomeItemSchema,
        response: { 200: planResponseSchema },
      },
    },
    async (request) =>
      patchIncomeItem(
        database.db,
        requireAuth(request),
        deps,
        request.params.start,
        request.params.id,
        request.body,
      ),
  )

  app.delete(
    '/plans/:start/income-items/:id',
    { schema: { params: itemParamsSchema, response: { 200: planResponseSchema } } },
    async (request) =>
      removeIncomeItem(
        database.db,
        requireAuth(request),
        deps,
        request.params.start,
        request.params.id,
      ),
  )

  app.post(
    '/plans/:start/copy-from/:from',
    {
      schema: {
        params: copyParamsSchema,
        body: copyPlanSchema,
        response: { 200: copyPlanResponseSchema },
      },
    },
    async (request) =>
      copyPlan(
        database.db,
        requireAuth(request),
        deps,
        request.params.start,
        request.params.from,
        request.body,
      ),
  )
}
