import { checkLedgerTransaction, type LedgerTransaction, type LedgerViolation } from '@mizan/domain'
import { badRequest } from '../../plugins/errors.ts'

/** What each invariant means to a person. The API returns these as the problem `detail`. */
const MESSAGES: Record<LedgerViolation, string> = {
  noLines: 'A transaction needs at least one line.',
  zeroAmount: 'A line cannot be for zero.',
  mixedCurrency: 'Every line of a transaction must use the same currency.',
  singleLineRequired: 'This kind of transaction has exactly one line.',
  transferNeedsTwoLines: 'A transfer has exactly two lines.',
  transferNeedsTwoAccounts: 'A transfer needs two different accounts.',
  transferMustNet: 'The two sides of a transfer must cancel out.',
  expenseMustBeNegative: 'Every line of an expense must be negative. Record a refund as income.',
  incomeMustBePositive: 'Every line of income must be positive.',
  splitNeedsOneAccount: 'A split stays on one account.',
}

/**
 * Runs the ledger invariants and turns a violation into a 400 the client can show.
 *
 * The domain decides; this only translates. Code that builds a transaction itself, where a
 * violation would be a bug rather than input, uses the domain's `assertLedgerTransaction`.
 */
export function validateTransaction(transaction: LedgerTransaction): void {
  const result = checkLedgerTransaction(transaction)
  if (!result.ok) throw badRequest(MESSAGES[result.violation])
}
