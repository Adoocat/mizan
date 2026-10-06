import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/testing/**'],
      reporter: ['text', 'html'],
      // PLAN §18: at least 95% branch coverage for financial logic.
      thresholds: { branches: 95, lines: 95, functions: 95, statements: 95 },
    },
  },
})
