import { defineConfig } from 'vitest/config'

// Integration tests start a real Postgres with Testcontainers, so Docker must be running.
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
