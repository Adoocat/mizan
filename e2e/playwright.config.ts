import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE } from './tests/support/accounts.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const API_PORT = '3100'
const WEB_PORT = '5180'
const WEB_URL = `http://localhost:${WEB_PORT}`

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Run E2E tests with `pnpm test:e2e` from the repo root.')
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  /*
   * Two browser projects share one API, one Vite dev server and one Postgres container. Left to
   * its own default (half the cores), Playwright oversubscribes a development machine badly
   * enough that writes start timing out — which looks like a product bug and is not one.
   */
  workers: process.env.CI ? 4 : 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    // Creates the account the signed-in specs share.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      testIgnore: /auth\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      testIgnore: /auth\.spec\.ts/,
    },
    // The credential screens need a browser with no session at all.
    {
      name: 'auth',
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
      testMatch: /auth\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @mizan/api start',
      cwd: repoRoot,
      url: `http://127.0.0.1:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: API_PORT,
        DATABASE_URL: databaseUrl,
        // Both browser projects drive this one API in parallel, and a page that lists
        // transactions holds several connections while it loads. The default 10 runs out.
        DATABASE_POOL_MAX: '40',
        WEB_ORIGIN: WEB_URL,
        LOG_LEVEL: 'warn',
        AUTH_SECRET: 'e2e-only-secret-at-least-thirty-two-chars',
        // Keeps the suite off the network: the breached-password check is an outbound call to
        // api.pwnedpasswords.com on every sign-up.
        AUTH_BREACHED_PASSWORD_CHECK: 'false',
      },
    },
    {
      command: 'pnpm --filter @mizan/web dev',
      cwd: repoRoot,
      url: WEB_URL,
      reuseExistingServer: false,
      env: {
        MIZAN_WEB_PORT: WEB_PORT,
        MIZAN_API_URL: `http://127.0.0.1:${API_PORT}`,
      },
    },
  ],
})
