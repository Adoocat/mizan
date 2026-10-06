import { defineConfig } from 'drizzle-kit'

// Only used to generate SQL migrations from the schema. Migrations are applied by src/db/migrate.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  casing: 'snake_case',
  strict: true,
})
