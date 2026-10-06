import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

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
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
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
        WEB_ORIGIN: WEB_URL,
        LOG_LEVEL: 'warn',
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
