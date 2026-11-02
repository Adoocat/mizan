import {
  confirmOccurrenceResponseSchema,
  confirmOccurrenceSchema,
  createRecurringRuleSchema,
  endRecurringRuleSchema,
  occurrenceResponseSchema,
  overrideOccurrenceSchema,
  pauseRecurringRuleSchema,
  recurringListResponseSchema,
  recurringRuleSchema,
  ruleOccurrencesResponseSchema,
  upcomingResponseSchema,
  updateRecurringRuleSchema,
} from '@mizan/contracts'
import { plainDateSchema } from '@mizan/contracts'
import type { Clock } from '@mizan/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { requireAuth } from '../../plugins/require-auth.ts'
import {
  clearOccurrenceException,
  confirmOccurrence,
  createRule,
  endRule,
  listRules,
  MAX_UPCOMING_DAYS,
  overrideOccurrence,
  patchRule,
  readRuleOccurrences,
  readUpcoming,
  removeRule,
  setRulePaused,
  skipOccurrence,
} from './service.ts'

const idParamsSchema = z.object({ id: z.uuid() })

/** `:date` is the occurrence's **original** date — its series date — never the shifted due date. */
const occurrenceParamsSchema = z.object({ id: z.uuid(), date: plainDateSchema })

const occurrencesQuerySchema = z.object({
  from: plainDateSchema.optional(),
  to: plainDateSchema.optional(),
})

const upcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_UPCOMING_DAYS).optional(),
})

/** `/recurring`, its occurrences, and `/upcoming` (PLAN §12). */
export const recurringRoutes: FastifyPluginAsyncZod<{ database: Database; clock: Clock }> = async (
  app,
  { database, clock },
) => {
  app.addHook('preHandler', app.requireSession)

  app.get(
    '/recurring',
    { schema: { response: { 200: recurringListResponseSchema } } },
    async (request) => listRules(database.db, requireAuth(request), { clock }),
  )

  app.post(
    '/recurring',
    {
      schema: {
        body: createRecurringRuleSchema,
        response: { 200: recurringRuleSchema, 201: recurringRuleSchema },
      },
    },
    async (request, reply) => {
      const { rule, created } = await createRule(
        database.db,
        requireAuth(request),
        { clock },
        request.body,
      )
      return reply.status(created ? 201 : 200).send(rule)
    },
  )

  app.get(
    '/recurring/:id/occurrences',
    {
      schema: {
        params: idParamsSchema,
        querystring: occurrencesQuerySchema,
        response: { 200: ruleOccurrencesResponseSchema },
      },
    },
    async (request) =>
      readRuleOccurrences(
        database.db,
        requireAuth(request),
        { clock },
        request.params.id,
        request.query,
      ),
  )

  app.patch(
    '/recurring/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateRecurringRuleSchema,
        response: { 200: recurringRuleSchema },
      },
    },
    async (request) =>
      patchRule(database.db, requireAuth(request), { clock }, request.params.id, request.body),
  )

  app.post(
    '/recurring/:id/pause',
    {
      schema: {
        params: idParamsSchema,
        body: pauseRecurringRuleSchema,
        response: { 200: recurringRuleSchema },
      },
    },
    async (request) =>
      setRulePaused(
        database.db,
        requireAuth(request),
        { clock },
        request.params.id,
        true,
        request.body,
      ),
  )

  app.post(
    '/recurring/:id/resume',
    { schema: { params: idParamsSchema, response: { 200: recurringRuleSchema } } },
    async (request) =>
      setRulePaused(database.db, requireAuth(request), { clock }, request.params.id, false),
  )

  app.post(
    '/recurring/:id/end',
    {
      schema: {
        params: idParamsSchema,
        body: endRecurringRuleSchema,
        response: { 200: recurringRuleSchema },
      },
    },
    async (request) =>
      endRule(database.db, requireAuth(request), { clock }, request.params.id, request.body),
  )

  app.delete(
    '/recurring/:id',
    { schema: { params: idParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await removeRule(database.db, requireAuth(request), request.params.id)
      return reply.status(204).send(null)
    },
  )

  app.post(
    '/recurring/:id/occurrences/:date/confirm',
    {
      schema: {
        params: occurrenceParamsSchema,
        body: confirmOccurrenceSchema,
        response: { 200: confirmOccurrenceResponseSchema },
      },
    },
    async (request) =>
      confirmOccurrence(
        database.db,
        requireAuth(request),
        { clock },
        request.params.id,
        request.params.date,
        request.body,
      ),
  )

  app.post(
    '/recurring/:id/occurrences/:date/skip',
    { schema: { params: occurrenceParamsSchema, response: { 200: occurrenceResponseSchema } } },
    async (request) =>
      skipOccurrence(
        database.db,
        requireAuth(request),
        { clock },
        request.params.id,
        request.params.date,
      ),
  )

  app.post(
    '/recurring/:id/occurrences/:date/override',
    {
      schema: {
        params: occurrenceParamsSchema,
        body: overrideOccurrenceSchema,
        response: { 200: occurrenceResponseSchema },
      },
    },
    async (request) =>
      overrideOccurrence(
        database.db,
        requireAuth(request),
        { clock },
        request.params.id,
        request.params.date,
        request.body,
      ),
  )

  app.delete(
    '/recurring/:id/occurrences/:date/exception',
    { schema: { params: occurrenceParamsSchema, response: { 200: occurrenceResponseSchema } } },
    async (request) =>
      clearOccurrenceException(
        database.db,
        requireAuth(request),
        { clock },
        request.params.id,
        request.params.date,
      ),
  )

  app.get(
    '/upcoming',
    { schema: { querystring: upcomingQuerySchema, response: { 200: upcomingResponseSchema } } },
    async (request) => readUpcoming(database.db, requireAuth(request), { clock }, request.query),
  )
}
