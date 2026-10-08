import {
  categoryGroupSchema,
  categoryListResponseSchema,
  categorySchema,
  createCategoryGroupSchema,
  createCategorySchema,
  mergeCategoryResponseSchema,
  mergeCategorySchema,
  reorderSchema,
  updateCategoryGroupSchema,
  updateCategorySchema,
} from '@mizan/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Database } from '../../db/client.ts'
import { requireAuth } from '../../plugins/require-auth.ts'
import {
  createCategory,
  createGroup,
  listCategories,
  mergeCategory,
  patchCategory,
  patchGroup,
  reorderCategories,
  reorderGroups,
  setCategoryArchived,
} from './service.ts'

const idParamsSchema = z.object({ id: z.uuid() })

const listQuerySchema = z.object({
  /** Archived categories are hidden by default; settings shows them to allow un-archiving. */
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

/** `/categories` and `/category-groups` (PLAN §12). */
export const categoryRoutes: FastifyPluginAsyncZod<{ database: Database }> = async (
  app,
  { database },
) => {
  app.addHook('preHandler', app.requireSession)

  app.get(
    '/categories',
    { schema: { querystring: listQuerySchema, response: { 200: categoryListResponseSchema } } },
    async (request) =>
      listCategories(database.db, requireAuth(request), {
        includeArchived: request.query.includeArchived,
      }),
  )

  app.post(
    '/categories',
    {
      schema: {
        body: createCategorySchema,
        response: { 200: categorySchema, 201: categorySchema },
      },
    },
    async (request, reply) => {
      const { category, created } = await createCategory(
        database.db,
        requireAuth(request),
        request.body,
      )
      return reply.status(created ? 201 : 200).send(category)
    },
  )

  app.patch(
    '/categories/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateCategorySchema,
        response: { 200: categorySchema },
      },
    },
    async (request) =>
      patchCategory(database.db, requireAuth(request), request.params.id, request.body),
  )

  app.post(
    '/categories/:id/archive',
    { schema: { params: idParamsSchema, response: { 200: categorySchema } } },
    async (request) =>
      setCategoryArchived(database.db, requireAuth(request), request.params.id, true),
  )

  app.post(
    '/categories/:id/unarchive',
    { schema: { params: idParamsSchema, response: { 200: categorySchema } } },
    async (request) =>
      setCategoryArchived(database.db, requireAuth(request), request.params.id, false),
  )

  app.post(
    '/categories/:id/merge',
    {
      schema: {
        params: idParamsSchema,
        body: mergeCategorySchema,
        response: { 200: mergeCategoryResponseSchema },
      },
    },
    async (request) =>
      mergeCategory(database.db, requireAuth(request), request.params.id, request.body.intoId),
  )

  app.post(
    '/categories/reorder',
    { schema: { body: reorderSchema, response: { 200: categoryListResponseSchema } } },
    async (request) => reorderCategories(database.db, requireAuth(request), request.body),
  )

  app.post(
    '/category-groups',
    {
      schema: {
        body: createCategoryGroupSchema,
        response: { 200: categoryGroupSchema, 201: categoryGroupSchema },
      },
    },
    async (request, reply) => {
      const { group, created } = await createGroup(database.db, requireAuth(request), request.body)
      return reply.status(created ? 201 : 200).send(group)
    },
  )

  app.patch(
    '/category-groups/:id',
    {
      schema: {
        params: idParamsSchema,
        body: updateCategoryGroupSchema,
        response: { 200: categoryGroupSchema },
      },
    },
    async (request) =>
      patchGroup(database.db, requireAuth(request), request.params.id, request.body),
  )

  app.post(
    '/category-groups/reorder',
    { schema: { body: reorderSchema, response: { 200: categoryListResponseSchema } } },
    async (request) => reorderGroups(database.db, requireAuth(request), request.body),
  )
}
