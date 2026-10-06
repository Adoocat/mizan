/**
 * Runs the Playwright suite against a throwaway Postgres:
 * start a container, apply migrations, run Playwright (which starts API and web), stop the container.
 * Extra arguments are passed to Playwright, e.g. `pnpm test:e2e --headed`.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer } from '@testcontainers/postgresql'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const e2eRoot = fileURLToPath(new URL('..', import.meta.url))

const quote = (arg: string) => (/^[\w@./:=-]+$/.test(arg) ? arg : JSON.stringify(arg))

// pnpm is a .cmd shim on Windows, so it has to go through a shell. We pass a single,
// quoted command line instead of an args array.
function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<number>((resolve, reject) => {
    const commandLine = [command, ...args].map(quote).join(' ')
    const child = spawn(commandLine, { cwd, env, stdio: 'inherit', shell: true })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

console.log('Starting Postgres for E2E…')
const container = await new PostgreSqlContainer('postgres:18-alpine').start()
const env = { ...process.env, DATABASE_URL: container.getConnectionUri() }

let exitCode: number
try {
  exitCode = await run('pnpm', ['--filter', '@mizan/api', 'db:migrate'], repoRoot, env)
  if (exitCode === 0) {
    exitCode = await run(
      'pnpm',
      ['exec', 'playwright', 'test', ...process.argv.slice(2)],
      e2eRoot,
      env,
    )
  }
} finally {
  await container.stop()
}
process.exit(exitCode)
