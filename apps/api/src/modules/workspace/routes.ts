import { meResponseSchema, updateMeSchema, updateWorkspaceSettingsSchema } from '@mizan/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { Database } from '../../db/client.ts'
import { requireAuth } from '../../plugins/require-auth.ts'
import { patchMe, patchWorkspaceSettings, readMe } from './service.ts'

/**
 * `/me` and `/workspace/settings` (PLAN §12): the profile and the workspace preferences that
 * every other screen reads — base currency, the day the plan month starts, language.
 */
export const workspaceRoutes: FastifyPluginAsyncZod<{ database: Database }> = async (
  app,
  { database },
) => {
  app.addHook('preHandler', app.requireSession)

  app.get('/me', { schema: { response: { 200: meResponseSchema } } }, async (request) =>
    readMe(requireAuth(request)),
  )

  app.patch(
    '/me',
    { schema: { body: updateMeSchema, response: { 200: meResponseSchema } } },
    async (request) => patchMe(database.db, requireAuth(request), request.body),
  )

  app.get(
    '/workspace/settings',
    { schema: { response: { 200: meResponseSchema } } },
    async (request) => readMe(requireAuth(request)),
  )

  app.patch(
    '/workspace/settings',
    { schema: { body: updateWorkspaceSettingsSchema, response: { 200: meResponseSchema } } },
    async (request) => patchWorkspaceSettings(database.db, requireAuth(request), request.body),
  )
}
