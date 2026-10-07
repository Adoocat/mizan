import {
  accountDetailResponseSchema,
  accountListResponseSchema,
  accountSchema,
  createAccountSchema,
  reconcileAccountResponseSchema,
  reconcileAccountSchema,
  updateAccountSchema,
} from '@mizan/contracts'
import type { Clock } from '@mizan/domain'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { requireAuth } from '../../plugins/require-auth.ts'
import {
  createAccount,
  listAccounts,
  patchAccount,
  readAccount,
  reconcileAccount,
  setAccountArchived,
} from './service.ts'

const idParamsSchema = z.object({ id: z.uuid() })

const listQuerySchema = z.object({
  /** Archived accounts are hidden by default; settings shows them to allow un-archiving. */
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

/**
 * `/accounts` (PLAN §12). Balances are derived from transaction lines on every read, so there is
 * no stored balance to go stale.
 */
export const accountRoutes: FastifyPluginAsyncZod<{ database: Database; clock: Clock }> = async (
  app,
  { database, clock },
) => {
  app.addHook('preHandler', app.requireSession)

  app.get(
    '/accounts',
    { schema: { querystring: listQuerySchema, response: { 200: accountListResponseSchema } } },
    async (request) =>
      listAccounts(database.db, requireAuth(request), {
        includeArchived: request.query.includeArchived,
      }),
  )

  app.post(
    '/accounts',
    {
      schema: {
        body: createAccountSchema,
        response: { 200: accountSchema, 201: accountSchema },
      },
    },
    async (request, reply) => {
      const { account, created } = await createAccount(
        database.db,
        requireAuth(request),
        clock,
        request.body,
      )
      // A repeat of the same client id is not a new account, so it answers 200, not 201.
      return reply.status(created ? 201 : 200).send(account)
    },
  )

  app.get(
    '/accounts/:id',
    { schema: { params: idParamsSchema, response: { 200: accountDetailResponseSchema } } },
    async (request) => readAccount(database.db, requireAuth(request), request.params.id),
  )

  app.patch(
    '/accounts/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateAccountSchema,
        response: { 200: accountSchema },
      },
    },
    async (request) =>
      patchAccount(database.db, requireAuth(request), request.params.id, request.body),
  )

  app.post(
    '/accounts/:id/archive',
    { schema: { params: idParamsSchema, response: { 200: accountSchema } } },
    async (request) =>
      setAccountArchived(database.db, requireAuth(request), request.params.id, true),
  )

  app.post(
    '/accounts/:id/unarchive',
    { schema: { params: idParamsSchema, response: { 200: accountSchema } } },
    async (request) =>
      setAccountArchived(database.db, requireAuth(request), request.params.id, false),
  )

  app.post(
    '/accounts/:id/reconcile',
    {
      schema: {
        params: idParamsSchema,
        body: reconcileAccountSchema,
        response: { 200: reconcileAccountResponseSchema },
      },
    },
    async (request) =>
      reconcileAccount(database.db, requireAuth(request), clock, request.params.id, request.body),
  )
}
