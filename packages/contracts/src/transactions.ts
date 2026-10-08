import { Money } from '@mizan/domain'
import { z } from 'zod'
import { transactionTypeSchema } from './accounts.ts'
import { moneySchema, plainDateSchema } from './primitives.ts'

export const payeeSchema = z.string().trim().max(120)
export const memoSchema = z.string().trim().max(200)
export const notesSchema = z.string().trim().max(1000)

/** An amount the client sends as a magnitude: the service applies the sign the type implies. */
const positiveMoneySchema = moneySchema.refine((value) => Money.fromDto(value).isPositive(), {
  message: 'Must be more than zero',
})

/**
 * One line of a transaction as the API returns it (PLAN §6).
 *
 * `amount` is signed: negative is money leaving the account. Names are deliberately absent — the
 * page already holds the accounts and categories it needs for its filters and pickers, and
 * resolving a category's name there keeps the English/Turkish decision in one place instead of
 * repeating it per row.
 */
export const transactionLineSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  categoryId: z.uuid().nullable(),
  amount: moneySchema,
  memo: z.string().nullable(),
})
export type TransactionLineDto = z.infer<typeof transactionLineSchema>

export const transactionSchema = z.object({
  id: z.uuid(),
  type: transactionTypeSchema,
  date: plainDateSchema,
  payee: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(['cleared', 'pending']),
  source: z.enum(['manual', 'recurring', 'import']),
  lines: z.array(transactionLineSchema).min(1),
  /** The signed total: what the transaction did to the accounts it touches, netted. */
  total: moneySchema,
  /** Set once soft-deleted. A deleted transaction is still returned by its own id, for undo (§7). */
  deletedAt: z.string().nullable(),
})
export type TransactionDto = z.infer<typeof transactionSchema>

/* ------------------------------------------------------------------ the list */

/** The chips above the list, as the Transactions mockup shows them. */
export const TRANSACTION_VIEWS = ['all', 'spending', 'income', 'transfers', 'needsReview'] as const
export type TransactionView = (typeof TRANSACTION_VIEWS)[number]
export const transactionViewSchema = z.enum(TRANSACTION_VIEWS)

export const TRANSACTION_PAGE_SIZE = 50
export const TRANSACTION_MAX_PAGE_SIZE = 200

/**
 * A page boundary: `YYYY-MM-DD|<uuid>`, the same order as the list index (date descending, then
 * id descending). An offset would skip or repeat rows as transactions are added underneath.
 */
export const transactionCursorSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\|[0-9a-f-]{36}$/, 'Not a page cursor')

/**
 * The list's filters. Everything here is also a URL parameter on the Transactions page, so a
 * filtered view can be shared or reloaded (§13).
 */
export const transactionListQuerySchema = z.object({
  from: plainDateSchema.optional(),
  to: plainDateSchema.optional(),
  accountId: z.array(z.uuid()).max(50).optional(),
  categoryId: z.array(z.uuid()).max(100).optional(),
  view: transactionViewSchema.default('all'),
  /** Free text over payee, notes and memos, folded for Turkish casing (§7). */
  q: z.string().trim().max(120).optional(),
  /** Magnitudes: `minAmount: 100` keeps every transaction of 100 or more, in or out. */
  minAmount: moneySchema.optional(),
  maxAmount: moneySchema.optional(),
  cursor: transactionCursorSchema.optional(),
  limit: z.number().int().min(1).max(TRANSACTION_MAX_PAGE_SIZE).default(TRANSACTION_PAGE_SIZE),
})
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>

/**
 * Totals over everything the filters match, not just the page on screen — the tiles above the
 * list would be meaningless otherwise. SQL sums, the domain rounds (§16).
 */
export const transactionSummarySchema = z.object({
  income: moneySchema,
  spending: moneySchema,
  transfers: moneySchema,
  /** Transactions with an on-budget line that has no category yet. */
  needsReview: z.number().int().min(0),
  matched: z.number().int().min(0),
})
export type TransactionSummary = z.infer<typeof transactionSummarySchema>

export const transactionListResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  /** Pass back as `cursor` for the next page; null when this is the last one. */
  nextCursor: transactionCursorSchema.nullable(),
  summary: transactionSummarySchema,
})
export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>

/* --------------------------------------------------------------- writing one */

/**
 * One part of an expense or income. A single part is an ordinary transaction; several parts on the
 * same account are a split (flow F4). `amount` is a magnitude — the type decides the sign.
 */
export const transactionPartSchema = z.object({
  categoryId: z.uuid().nullable().optional(),
  amount: positiveMoneySchema,
  memo: memoSchema.optional(),
})
export type TransactionPartInput = z.infer<typeof transactionPartSchema>

const writeBase = {
  id: z.uuid().optional(),
  date: plainDateSchema,
  payee: payeeSchema.optional(),
  notes: notesSchema.optional(),
}

const spendOrEarnBase = {
  ...writeBase,
  accountId: z.uuid(),
  parts: z.array(transactionPartSchema).min(1).max(20),
}

export const createExpenseSchema = z.object({ type: z.literal('expense'), ...spendOrEarnBase })
export const createIncomeSchema = z.object({ type: z.literal('income'), ...spendOrEarnBase })

/**
 * A transfer moves one amount between two accounts. It carries a category only when it leaves the
 * budget — into an investment or loan account — because that is the point at which the plan sees
 * the money go (§10).
 */
export const createTransferSchema = z.object({
  type: z.literal('transfer'),
  ...writeBase,
  fromAccountId: z.uuid(),
  toAccountId: z.uuid(),
  amount: positiveMoneySchema,
  categoryId: z.uuid().nullable().optional(),
  memo: memoSchema.optional(),
})

export const createTransactionSchema = z.discriminatedUnion('type', [
  createExpenseSchema,
  createIncomeSchema,
  createTransferSchema,
])
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>

/**
 * An edit states what the transaction should now be, rather than patching parts of it: the lines
 * of a split have no stable identity a client could address, and replacing them wholesale is the
 * only way an edit cannot leave a half-updated split behind. Changing the kind is allowed — a
 * transfer mistyped as an expense is a common correction.
 */
export const updateTransactionSchema = z.discriminatedUnion('type', [
  createExpenseSchema.omit({ id: true }),
  createIncomeSchema.omit({ id: true }),
  createTransferSchema.omit({ id: true }),
])
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>

export const transactionResponseSchema = z.object({ transaction: transactionSchema })
export type TransactionResponse = z.infer<typeof transactionResponseSchema>
