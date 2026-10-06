import { buildApp } from './app.ts'
import { loadConfig } from './config/env.ts'
import { createDatabase } from './db/client.ts'

const config = loadConfig(process.env)
const database = createDatabase(config.databaseUrl)
const app = await buildApp({ config, database })

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
