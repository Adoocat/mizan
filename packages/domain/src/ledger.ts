/**
 * The ledger: the source of truth for money (PLAN §6, §7).
 *
 * A transaction is a header with one or more signed lines. One structure covers splits (several
 * lines on the same account with different categories), transfers (two lines on different
 * accounts) and, later, cross-currency transfers. Nothing here does I/O: the service hands these
 * functions line descriptors and they decide whether the movement is legal and what it sums to.
 */
import { getCurrency } from './currency.ts'
import { Money } from './money.ts'

/* ------------------------------------------------------------------ accounts */

export interface AccountTypeInfo {
  readonly type: AccountType
  /** A negative balance means money owed, and the account subtracts from net worth. */
  readonly liability: boolean
  /** Transactions on this account affect the plan unless the user says otherwise. */
  readonly defaultOnBudget: boolean
  /** How the Accounts page groups it. */
  readonly group: AccountGroup
  /** Display order of the type inside its group. */
  readonly sortOrder: number
}

/** The groups the Accounts page shows, in order (mockup: Accounts). */
export const ACCOUNT_GROUPS = ['cash', 'bank', 'card'] as const
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number]

/**
 * Account types in the MVP. Investment, loan and manual-asset accounts arrive in v1.1 (§8),
 * which is why this is a registry rather than a bare union.
 */
export const ACCOUNT_TYPES = {
  checking: {
    type: 'checking',
    liability: false,
    defaultOnBudget: true,
    group: 'bank',
    sortOrder: 1,
  },
  savings: {
    type: 'savings',
    liability: false,
    defaultOnBudget: true,
    group: 'bank',
    sortOrder: 2,
  },
  cash: { type: 'cash', liability: false, defaultOnBudget: true, group: 'cash', sortOrder: 3 },
  credit_card: {
    type: 'credit_card',
    liability: true,
    defaultOnBudget: true,
    group: 'card',
    sortOrder: 4,
  },
} as const satisfies Record<string, Omit<AccountTypeInfo, 'type'> & { type: string }>

export type AccountType = keyof typeof ACCOUNT_TYPES

export const ACCOUNT_TYPE_LIST = Object.keys(ACCOUNT_TYPES) as AccountType[]

export class UnknownAccountTypeError extends Error {
  override name = 'UnknownAccountTypeError'
}

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && Object.hasOwn(ACCOUNT_TYPES, value)
}

export function accountType(value: string): AccountTypeInfo {
  if (!isAccountType(value)) throw new UnknownAccountTypeError(`Unknown account type: ${value}`)
  return ACCOUNT_TYPES[value]
}

export const isLiabilityAccount = (value: string): boolean => accountType(value).liability

/* -------------------------------------------------------------- transactions */

/**
 * Transaction kinds in the MVP. `investment` arrives in v1.1 (§8).
 *
 * - `expense` — money leaving an on-budget account; every line is negative. A **refund** is
 *   recorded as an `income` transaction in the same category, so an expense never mixes signs.
 * - `income` — money arriving; every line is positive.
 * - `transfer` — exactly two lines on two different accounts that sum to zero.
 * - `adjustment` — a correction from reconciling against a statement; one line, either sign.
 * - `opening_balance` — the balance an account started with; one line, either sign.
 */
export const TRANSACTION_TYPES = [
  'expense',
  'income',
  'transfer',
  'adjustment',
  'opening_balance',
] as const

export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && (TRANSACTION_TYPES as readonly string[]).includes(value)
}

/** One signed movement on one account. `amount` is never zero. */
export interface LedgerLine {
  accountId: string
  amount: Money
  categoryId?: string | null
  goalId?: string | null
}

export interface LedgerTransaction {
  type: TransactionType
  lines: readonly LedgerLine[]
}

/** Why a transaction was refused. Each maps to a message in the API and the UI. */
export const LEDGER_VIOLATIONS = [
  'noLines',
  'zeroAmount',
  'mixedCurrency',
  'singleLineRequired',
  'transferNeedsTwoLines',
  'transferNeedsTwoAccounts',
  'transferMustNet',
  'expenseMustBeNegative',
  'incomeMustBePositive',
  'splitNeedsOneAccount',
] as const

export type LedgerViolation = (typeof LEDGER_VIOLATIONS)[number]

export type LedgerCheck = { ok: true } | { ok: false; violation: LedgerViolation }

export class LedgerInvariantError extends Error {
  override name = 'LedgerInvariantError'
  readonly violation: LedgerViolation

  constructor(violation: LedgerViolation) {
    super(`Ledger invariant violated: ${violation}`)
    this.violation = violation
  }
}

const ok: LedgerCheck = { ok: true }
const fail = (violation: LedgerViolation): LedgerCheck => ({ ok: false, violation })

/**
 * The invariants every transaction must satisfy before it is written (§7). Returns the first
 * violation rather than throwing, so a service can map it to a message; `assertLedgerTransaction`
 * is the throwing form.
 *
 * Note what is *not* checked here, because the domain cannot see the database: that each line's
 * currency equals its account's currency (the composite foreign key guarantees it), that an
 * on-budget expense carries a category (phase 5, when categories exist), and that the period is
 * open (phase 10).
 */
export function checkLedgerTransaction({ type, lines }: LedgerTransaction): LedgerCheck {
  if (lines.length === 0) return fail('noLines')

  const first = lines[0]!
  for (const line of lines) {
    if (line.amount.isZero()) return fail('zeroAmount')
    if (line.amount.currency !== first.amount.currency) return fail('mixedCurrency')
  }

  const accounts = new Set(lines.map((line) => line.accountId))

  switch (type) {
    case 'opening_balance':
    case 'adjustment':
      return lines.length === 1 ? ok : fail('singleLineRequired')

    case 'transfer': {
      if (lines.length !== 2) return fail('transferNeedsTwoLines')
      if (accounts.size !== 2) return fail('transferNeedsTwoAccounts')
      // Same-currency transfers must net to zero: money moves, it is not created.
      return Money.sum(
        lines.map((line) => line.amount),
        first.amount.currency,
      ).isZero()
        ? ok
        : fail('transferMustNet')
    }

    case 'expense':
      if (accounts.size !== 1) return fail('splitNeedsOneAccount')
      return lines.every((line) => line.amount.isNegative()) ? ok : fail('expenseMustBeNegative')

    case 'income':
      if (accounts.size !== 1) return fail('splitNeedsOneAccount')
      return lines.every((line) => line.amount.isPositive()) ? ok : fail('incomeMustBePositive')
  }
}

export function assertLedgerTransaction(transaction: LedgerTransaction): void {
  const result = checkLedgerTransaction(transaction)
  if (!result.ok) throw new LedgerInvariantError(result.violation)
}

/* ----------------------------------------------------------------- balances */

/**
 * An account's balance is the sum of its lines — there is no stored balance column, so it cannot
 * drift (§7). The currency is passed in so an account with no transactions still answers zero in
 * its own currency.
 */
export function accountBalance(amounts: readonly Money[], currency: string): Money {
  return Money.sum(amounts, currency).roundToMinor()
}

export interface AccountBalance {
  /** Signed balance in the account's own currency: negative on a card means money owed. */
  readonly balance: Money
  readonly type: AccountType
  readonly includeInNetWorth: boolean
}

/**
 * Net worth: assets minus liabilities (§16). Card balances are already negative, so this is a
 * plain sum of the accounts that count. Multi-currency conversion arrives in v1.1; until then
 * every account is in the base currency (decision D7).
 */
export function netWorth(accounts: readonly AccountBalance[], baseCurrency: string): Money {
  const counted = accounts.filter((account) => account.includeInNetWorth)
  return Money.sum(
    counted.map((account) => account.balance),
    baseCurrency,
  ).roundToMinor()
}

/**
 * The correction that makes a derived balance match a statement (reconcile). Positive when the
 * statement is higher than what Mizan has recorded. Zero means nothing is missing and no
 * adjustment transaction should be written.
 */
export function reconcileAdjustment(derived: Money, statement: Money): Money {
  return statement.minus(derived).roundToMinor()
}

/** The opening-balance line for a new account. Zero means no transaction is needed at all. */
export function openingBalanceLine(accountId: string, amount: Money): LedgerLine | null {
  const rounded = amount.roundToMinor()
  return rounded.isZero() ? null : { accountId, amount: rounded, categoryId: null, goalId: null }
}

/** Groups account types the way the Accounts page lists them. */
export function accountGroupOf(type: string): AccountGroup {
  return accountType(type).group
}

/** Sort key for a list of accounts: group order, then type order, then the user's own order. */
export function compareAccountTypes(a: string, b: string): number {
  return accountType(a).sortOrder - accountType(b).sortOrder
}

/**
 * Whether an account may use this currency. In the MVP every account is in the workspace's base
 * currency: multi-currency accounts, and the frozen base amounts they need, arrive in v1.1
 * (decision D7). The caller turns a `false` into the right API error.
 */
export function isAllowedAccountCurrency(currency: string, baseCurrency: string): boolean {
  return getCurrency(currency).code === getCurrency(baseCurrency).code
}
