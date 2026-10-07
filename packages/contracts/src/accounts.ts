import { ACCOUNT_TYPE_LIST, TRANSACTION_TYPES, type AccountType } from '@mizan/domain'
import { z } from 'zod'
import { currencyCodeSchema, moneySchema, plainDateSchema } from './primitives.ts'

export const accountTypeSchema = z.enum(ACCOUNT_TYPE_LIST as [AccountType, ...AccountType[]])

export const accountNameSchema = z.string().trim().min(1).max(80)
export const institutionSchema = z.string().trim().max(80)

/**
 * An account as the API returns it. `balance` is derived from the account's transaction lines on
 * every read — there is no stored balance (PLAN §7) — and is signed: negative on a credit card
 * means money owed.
 */
export const accountSchema = z.object({
  id: z.uuid(),
  name: accountNameSchema,
  type: accountTypeSchema,
  currency: currencyCodeSchema,
  institution: z.string().nullable(),
  onBudget: z.boolean(),
  includeInNetWorth: z.boolean(),
  sortOrder: z.number().int(),
  /** Set once the account is archived; archived accounts keep their history (§7). */
  archivedAt: z.string().nullable(),
  balance: moneySchema,
})
export type AccountDto = z.infer<typeof accountSchema>

export const accountListResponseSchema = z.object({
  accounts: z.array(accountSchema),
  /** Assets minus liabilities across the accounts that count towards net worth (§16). */
  netWorth: moneySchema,
  /** The part of that which sits in on-budget accounts. */
  onBudgetTotal: moneySchema,
})
export type AccountListResponse = z.infer<typeof accountListResponseSchema>

/**
 * `id` is optional and supplied by the client as a UUID, which is what makes creates idempotent:
 * a double tap sends the same id twice and the second call returns the account that already
 * exists instead of a duplicate (§12).
 */
export const createAccountSchema = z.object({
  id: z.uuid().optional(),
  name: accountNameSchema,
  type: accountTypeSchema,
  institution: institutionSchema.optional(),
  onBudget: z.boolean().optional(),
  includeInNetWorth: z.boolean().optional(),
  /**
   * What the account holds right now. Written as a single `opening_balance` transaction, so the
   * balance is derived like every other balance (flow F1, step 3). Omitted or zero means none.
   */
  openingBalance: moneySchema.optional(),
  /** The date that opening balance is as of. Defaults to today in the workspace's time zone. */
  openingBalanceDate: plainDateSchema.optional(),
})
export type CreateAccountInput = z.infer<typeof createAccountSchema>

export const updateAccountSchema = z
  .object({
    name: accountNameSchema,
    institution: institutionSchema.nullable(),
    onBudget: z.boolean(),
    includeInNetWorth: z.boolean(),
    sortOrder: z.number().int().min(0).max(9999),
  })
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  })
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>

export const transactionTypeSchema = z.enum(TRANSACTION_TYPES)

/**
 * One row of an account's recent activity. Phase 5 replaces this with the full transaction list
 * (filters, search, splits); here it exists so the account detail view can show what moved.
 */
export const ledgerEntrySchema = z.object({
  id: z.uuid(),
  transactionId: z.uuid(),
  date: plainDateSchema,
  type: transactionTypeSchema,
  payee: z.string().nullable(),
  memo: z.string().nullable(),
  amount: moneySchema,
})
export type LedgerEntryDto = z.infer<typeof ledgerEntrySchema>

export const accountDetailResponseSchema = z.object({
  account: accountSchema,
  entries: z.array(ledgerEntrySchema),
})
export type AccountDetailResponse = z.infer<typeof accountDetailResponseSchema>

/**
 * Reconciling: the user types the balance their statement shows, and Mizan writes the one
 * `adjustment` transaction that makes its own figure match (§16).
 */
export const reconcileAccountSchema = z.object({
  statementBalance: moneySchema,
  /** The statement date. Defaults to today in the workspace's time zone. */
  date: plainDateSchema.optional(),
  memo: z.string().trim().max(200).optional(),
})
export type ReconcileAccountInput = z.infer<typeof reconcileAccountSchema>

export const reconcileAccountResponseSchema = z.object({
  account: accountSchema,
  /** The correction that was written. Zero means the two already agreed and nothing was written. */
  adjustment: moneySchema,
})
export type ReconcileAccountResponse = z.infer<typeof reconcileAccountResponseSchema>
