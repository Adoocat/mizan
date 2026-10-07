import { buildApp } from './app.ts'
import { createAuth } from './auth/auth.ts'
import { createConsoleMailer } from './auth/mailer.ts'
import { loadConfig } from './config/env.ts'
import { createDatabase } from './db/client.ts'

const config = loadConfig(process.env)
const database = createDatabase(config.databaseUrl)

// The app's own logger only exists once Fastify is built, and the mailer is needed before that,
// so it logs to the console. Reset links are printed only in development (see createConsoleMailer).
const mailer = createConsoleMailer(console, config.nodeEnv === 'development')

const auth = createAuth({ config, database, mailer })
const app = await buildApp({ config, database, auth })

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, 'shutting down')
  await app.close()
  await database.close()
  process.exit(0)
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ host: config.host, port: config.port })
