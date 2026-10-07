import { defineConfig } from 'vitest/config'

// Integration tests run against a real Postgres, so Docker must be running. One container is
// started and migrated for the whole run by src/testing/global-setup.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['./src/testing/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
