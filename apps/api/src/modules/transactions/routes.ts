import {
  amountStringSchema,
  createTransactionSchema,
  transactionListQuerySchema,
  transactionListResponseSchema,
  transactionSchema,
  updateTransactionSchema,
  type MoneyDto,
} from '@mizan/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { requireAuth } from '../../plugins/require-auth.ts'
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  readTransaction,
  replaceTransaction,
  restoreTransaction,
} from './service.ts'

const idParamsSchema = z.object({ id: z.uuid() })

/**
 * The list's filters arrive as query parameters, which are always strings: `accountId` may repeat,
 * and `limit` has to be coerced. The shapes themselves live in `@mizan/contracts` so the web app
 * builds the same URL the API parses.
 */
const listQuerySchema = transactionListQuerySchema.extend({
  accountId: z
    .union([z.uuid(), z.array(z.uuid())])
    .optional()
    .transform((value) => (value === undefined ? undefined : [value].flat())),
  categoryId: z
    .union([z.uuid(), z.array(z.uuid())])
    .optional()
    .transform((value) => (value === undefined ? undefined : [value].flat())),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /**
   * Bare amounts rather than nested objects: a URL cannot carry `{amount, currency}`. The
   * currency is the workspace's base currency, which is the only one an account can use in the
   * MVP (decision D7).
   */
  minAmount: amountStringSchema.optional(),
  maxAmount: amountStringSchema.optional(),
})

/** `/transactions` (PLAN §12). */
export const transactionRoutes: FastifyPluginAsyncZod<{ database: Database }> = async (
  app,
  { database },
) => {
  app.addHook('preHandler', app.requireSession)

  app.get(
    '/transactions',
    { schema: { querystring: listQuerySchema, response: { 200: transactionListResponseSchema } } },
    async (request) => {
      const auth = requireAuth(request)
      const { minAmount, maxAmount, ...rest } = request.query
      // The column is a foreign key onto `currencies`, whose codes are the enum's.
      const currency = auth.workspace.baseCurrency as MoneyDto['currency']
      return listTransactions(database.db, auth, {
        ...rest,
        ...(minAmount ? { minAmount: { amount: minAmount, currency } } : {}),
        ...(maxAmount ? { maxAmount: { amount: maxAmount, currency } } : {}),
      })
    },
  )

  app.post(
    '/transactions',
    {
      schema: {
        body: createTransactionSchema,
        response: { 200: transactionSchema, 201: transactionSchema },
      },
    },
    async (request, reply) => {
      const { transaction, created } = await createTransaction(
        database.db,
        requireAuth(request),
        request.body,
      )
      // A repeat of the same client id is not a new transaction, so it answers 200, not 201.
      return reply.status(created ? 201 : 200).send(transaction)
    },
  )

  app.get(
    '/transactions/:id',
    { schema: { params: idParamsSchema, response: { 200: transactionSchema } } },
    async (request) => readTransaction(database.db, requireAuth(request), request.params.id),
  )

  app.put(
    '/transactions/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateTransactionSchema,
        response: { 200: transactionSchema },
      },
    },
    async (request) =>
      replaceTransaction(database.db, requireAuth(request), request.params.id, request.body),
  )

  app.delete(
    '/transactions/:id',
    { schema: { params: idParamsSchema, response: { 200: transactionSchema } } },
    async (request) => deleteTransaction(database.db, requireAuth(request), request.params.id),
  )

  app.post(
    '/transactions/:id/restore',
    { schema: { params: idParamsSchema, response: { 200: transactionSchema } } },
    async (request) => restoreTransaction(database.db, requireAuth(request), request.params.id),
  )
}
