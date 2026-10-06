import { pino } from 'pino'
import { loadConfig } from './config/env.ts'

// Placeholder for the background worker. pg-boss jobs (recurring auto-post, period auto-close)
// arrive in later phases.
const config = loadConfig(process.env)
const log = pino({ level: config.logLevel, base: { process: 'worker' } })

log.info('worker started; no jobs registered yet')

const keepAlive = setInterval(() => {}, 60_000)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'worker stopping')
    clearInterval(keepAlive)
  })
}
