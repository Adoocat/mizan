import { PgBoss } from 'pg-boss'
import { pino } from 'pino'
import { loadConfig } from './config/env.ts'
import { createDatabase } from './db/client.ts'
import { systemClock } from './lib/clock.ts'
import { runAutoPost, rollRepeatingSinkingFunds } from './modules/recurring/jobs.ts'

/**
 * The background worker (PLAN §19).
 *
 * pg-boss is only the clock here: both jobs are plain functions over the database that the
 * integration tests call directly, so what runs in production is what the tests cover and a
 * missing queue can never hide a broken job. They are idempotent by construction — auto-post
 * leans on a unique index, the roll-forward is a function of today's date — which is what makes
 * a cron schedule safe to retry and two workers safe to overlap.
 *
 * The schedules are in Europe/Istanbul: a job that decides what is "due today" has to agree with
 * the day the user is living in (decision D3). Both run early, after midnight and before anyone
 * is likely to look at their plan.
 */
const config = loadConfig(process.env)
const log = pino({ level: config.logLevel, base: { process: 'worker' } })
const database = createDatabase(config.databaseUrl, { max: config.databasePoolMax })

export const AUTO_POST_QUEUE = 'recurring.auto-post'
export const ROLL_GOALS_QUEUE = 'goals.roll-sinking-funds'

const TIME_ZONE = 'Europe/Istanbul'

const boss = new PgBoss({ connectionString: config.databaseUrl, schema: 'pgboss' })
boss.on('error', (error: unknown) => log.error({ error }, 'pg-boss error'))

await boss.start()
await boss.createQueue(AUTO_POST_QUEUE)
await boss.createQueue(ROLL_GOALS_QUEUE)

await boss.work<void>(AUTO_POST_QUEUE, async () => {
  const result = await runAutoPost(database.db, systemClock)
  // Counts only: a log line must never carry an amount or a payee (CLAUDE.md).
  log.info(result, 'auto-posted recurring occurrences')
})

await boss.work<void>(ROLL_GOALS_QUEUE, async () => {
  const result = await rollRepeatingSinkingFunds(database.db, systemClock)
  log.info(result, 'rolled repeating sinking funds forward')
})

// 03:10 and 03:20 daily. A single run catches up anything an outage missed.
await boss.schedule(AUTO_POST_QUEUE, '10 3 * * *', undefined, { tz: TIME_ZONE })
await boss.schedule(ROLL_GOALS_QUEUE, '20 3 * * *', undefined, { tz: TIME_ZONE })

log.info({ queues: [AUTO_POST_QUEUE, ROLL_GOALS_QUEUE] }, 'worker started')

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'worker stopping')
    void (async () => {
      await boss.stop({ graceful: true })
      await database.close()
      process.exit(0)
    })()
  })
}
