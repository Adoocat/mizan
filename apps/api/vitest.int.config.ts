import { defineConfig } from 'vitest/config'

// Integration tests run against a real Postgres, so Docker must be running. One container is
// started and migrated for the whole run by src/testing/global-setup.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['./src/testing/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    /*
     * Coverage is measured here rather than on the unit run, because this is where the API's
     * actual logic runs: the services, the repositories and the routes are exercised against a
     * real Postgres, and the unit tests only cover config parsing and password hashing.
     *
     * The floor is lower than the domain's 95% (PLAN §18) on purpose. The domain is pure
     * arithmetic where every branch is reachable from a test; a service layer has error paths
     * that need a database to misbehave to reach. The numbers are set a few points under what the
     * suite actually achieves today — 90% of statements and 78% of branches — so they catch a
     * slide without breaking on normal variation, and without inviting tests written for the
     * metric rather than for the behaviour.
     */
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/*.ts', 'src/plugins/**/*.ts', 'src/db/schema/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/isolation.ts', 'src/testing/**'],
      reporter: ['text', 'html'],
      thresholds: { branches: 75, lines: 90, functions: 90, statements: 87 },
    },
  },
})
