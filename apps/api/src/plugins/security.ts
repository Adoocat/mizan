import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import type { FastifyInstance } from 'fastify'

export async function registerSecurity(app: FastifyInstance, options: { webOrigin: string }) {
  // The API only serves JSON, so the strictest CSP applies.
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })

  await app.register(cors, {
    // A list (not a string) so only an exact match is reflected; other origins get no CORS headers.
    origin: [options.webOrigin],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })

  // Financial data must never be cached by browsers or proxies.
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('cache-control', 'no-store')
    return payload
  })
}
