import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyServerOptions } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { AppConfig } from './config/env.ts'
import type { Database } from './db/client.ts'
import { healthRoutes } from './modules/health/routes.ts'
import { registerErrorHandlers } from './plugins/errors.ts'
import { registerSecurity } from './plugins/security.ts'

export interface AppDependencies {
  config: Pick<AppConfig, 'logLevel' | 'webOrigin' | 'trustProxy'>
  database: Database
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

export async function buildApp({ config, database }: AppDependencies) {
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

  registerErrorHandlers(app)
  await registerSecurity(app, { webOrigin: config.webOrigin })

  await app.register(
    async (api) => {
      await api.register(healthRoutes, { database })
    },
    { prefix: '/api/v1' },
  )

  return app
}

export type App = Awaited<ReturnType<typeof buildApp>>
