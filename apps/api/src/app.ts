import { randomUUID } from 'node:crypto'
import type { Clock } from '@mizan/domain'
import Fastify, { type FastifyServerOptions } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Auth } from './auth/auth.ts'
import type { AppConfig } from './config/env.ts'
import type { Database } from './db/client.ts'
import { systemClock } from './lib/clock.ts'
import { accountRoutes } from './modules/accounts/routes.ts'
import { healthRoutes } from './modules/health/routes.ts'
import { workspaceRoutes } from './modules/workspace/routes.ts'
import { registerAuth } from './plugins/auth.ts'
import { registerBodyParsing } from './plugins/body.ts'
import { registerErrorHandlers } from './plugins/errors.ts'
import { registerOriginCheck } from './plugins/origin.ts'
import { registerSecurity } from './plugins/security.ts'

export interface AppDependencies {
  config: Pick<AppConfig, 'logLevel' | 'webOrigin' | 'trustProxy'>
  database: Database
  auth: Auth
  /** Injected so tests can pin "today"; defaults to the system clock. */
  clock?: Clock
}

const REQUEST_BODY_LIMIT_BYTES = 100 * 1024

function loggerOptions(level: AppConfig['logLevel']): FastifyServerOptions['logger'] {
  if (level === 'silent') return false
  return {
    level,
    // Never log bodies, query strings, cookies or auth headers: they can carry amounts, notes or secrets.
    serializers: {
      req: (request: { method: string; url: string }) => ({
        method: request.method,
        path: request.url.split('?')[0],
      }),
      res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
    },
  }
}

export async function buildApp({ config, database, auth, clock = systemClock }: AppDependencies) {
  const app = Fastify({
    logger: loggerOptions(config.logLevel),
    trustProxy: config.trustProxy,
    bodyLimit: REQUEST_BODY_LIMIT_BYTES,
    // Always generate our own request id; client-supplied ids are ignored.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  registerBodyParsing(app)
  registerErrorHandlers(app)
  await registerSecurity(app, { webOrigin: config.webOrigin })
  registerOriginCheck(app, { webOrigin: config.webOrigin })

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { database })
      // Not encapsulated: it decorates `requireSession` for the route modules that follow.
      await registerAuth(api, { auth, database, webOrigin: config.webOrigin })
      await api.register(workspaceRoutes, { database })
      await api.register(accountRoutes, { database, clock })
    },
    { prefix: '/api/v1' },
  )

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
