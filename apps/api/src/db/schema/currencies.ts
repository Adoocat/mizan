import { sql } from 'drizzle-orm'
import { char, check, pgTable, smallint, text } from 'drizzle-orm/pg-core'

export const currencies = pgTable(
  'currencies',
  {
    code: char({ length: 3 }).primaryKey(),
    minorUnits: smallint().notNull(),
    symbol: text().notNull(),
  },
  (table) => [
    check('currencies_code_format', sql`${table.code} ~ '^[A-Z]{3}$'`),
    check('currencies_minor_units_range', sql`${table.minorUnits} BETWEEN 0 AND 4`),
  ],
)
