import {
  addGoalToPlanSchema,
  createContributionSchema,
  createGoalSchema,
  goalListResponseSchema,
  goalResponseSchema,
  goalSchema,
  updateGoalSchema,
} from '@mizan/contracts'
import type { Clock } from '@mizan/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { requireAuth } from '../../plugins/require-auth.ts'
import {
  addGoalToPlan,
  contribute,
  createGoal,
  listGoals,
  patchGoal,
  readGoal,
  removeContribution,
  setGoalArchived,
} from './service.ts'

const idParamsSchema = z.object({ id: z.uuid() })
const contributionParamsSchema = z.object({ id: z.uuid(), contributionId: z.uuid() })

const listQuerySchema = z.object({
  /** Archived goals are hidden by default; the Goals page shows them to allow un-archiving. */
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

/** `/goals`, `/goals/:id` and `/goals/:id/contributions` (PLAN §12). */
export const goalRoutes: FastifyPluginAsyncZod<{ database: Database; clock: Clock }> = async (
  app,
  { database, clock },
) => {
  app.addHook('preHandler', app.requireSession)

  app.get(
    '/goals',
    { schema: { querystring: listQuerySchema, response: { 200: goalListResponseSchema } } },
    async (request) =>
      listGoals(
        database.db,
        requireAuth(request),
        { clock },
        {
          includeArchived: request.query.includeArchived,
        },
      ),
  )

  app.post(
    '/goals',
    { schema: { body: createGoalSchema, response: { 200: goalSchema, 201: goalSchema } } },
    async (request, reply) => {
      const { goal, created } = await createGoal(
        database.db,
        requireAuth(request),
        { clock },
        request.body,
      )
      return reply.status(created ? 201 : 200).send(goal)
    },
  )

  app.get(
    '/goals/:id',
    { schema: { params: idParamsSchema, response: { 200: goalResponseSchema } } },
    async (request) => readGoal(database.db, requireAuth(request), { clock }, request.params.id),
  )

  app.patch(
    '/goals/:id',
    { schema: { params: idParamsSchema, body: updateGoalSchema, response: { 200: goalSchema } } },
    async (request) =>
      patchGoal(database.db, requireAuth(request), { clock }, request.params.id, request.body),
  )

  app.post(
    '/goals/:id/archive',
    { schema: { params: idParamsSchema, response: { 200: goalSchema } } },
    async (request) =>
      setGoalArchived(database.db, requireAuth(request), { clock }, request.params.id, true),
  )

  app.post(
    '/goals/:id/unarchive',
    { schema: { params: idParamsSchema, response: { 200: goalSchema } } },
    async (request) =>
      setGoalArchived(database.db, requireAuth(request), { clock }, request.params.id, false),
  )

  app.post(
    '/goals/:id/contributions',
    {
      schema: {
        params: idParamsSchema,
        body: createContributionSchema,
        response: { 200: goalResponseSchema },
      },
    },
    async (request) =>
      contribute(database.db, requireAuth(request), { clock }, request.params.id, request.body),
  )

  app.delete(
    '/goals/:id/contributions/:contributionId',
    { schema: { params: contributionParamsSchema, response: { 200: goalResponseSchema } } },
    async (request) =>
      removeContribution(
        database.db,
        requireAuth(request),
        { clock },
        request.params.id,
        request.params.contributionId,
      ),
  )

  app.post(
    '/goals/:id/plan-line',
    {
      schema: {
        params: idParamsSchema,
        body: addGoalToPlanSchema,
        response: { 200: goalResponseSchema },
      },
    },
    async (request) =>
      addGoalToPlan(database.db, requireAuth(request), { clock }, request.params.id, request.body),
  )
}
