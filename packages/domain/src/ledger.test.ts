import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_TYPE_LIST,
  accountBalance,
  accountGroupOf,
  accountType,
  assertLedgerTransaction,
  checkLedgerTransaction,
  compareAccountTypes,
  isAccountType,
  isAllowedAccountCurrency,
  isLiabilityAccount,
  isSplitComplete,
  isTransactionType,
  LedgerInvariantError,
  netWorth,
  openingBalanceLine,
  reconcileAdjustment,
  splitRemainder,
  TRANSACTION_TYPES,
  UnknownAccountTypeError,
  type LedgerLine,
} from './ledger.ts'
import { Money } from './money.ts'

const tl = (amount: string) => Money.of(amount, 'TRY')
const line = (accountId: string, amount: string): LedgerLine => ({ accountId, amount: tl(amount) })

describe('account types', () => {
  it('covers the four MVP types', () => {
    expect(ACCOUNT_TYPE_LIST).toEqual(['checking', 'savings', 'cash', 'credit_card'])
  })

  it('treats only the credit card as a liability', () => {
    expect(isLiabilityAccount('credit_card')).toBe(true)
    for (const type of ['checking', 'savings', 'cash']) {
      expect(isLiabilityAccount(type), type).toBe(false)
    }
  })

  it('puts every type on budget by default', () => {
    for (const type of ACCOUNT_TYPE_LIST) {
      expect(accountType(type).defaultOnBudget, type).toBe(true)
    }
  })

  it('groups types the way the Accounts page lists them', () => {
    expect(accountGroupOf('checking')).toBe('bank')
    expect(accountGroupOf('savings')).toBe('bank')
    expect(accountGroupOf('cash')).toBe('cash')
    expect(accountGroupOf('credit_card')).toBe('card')
  })

  it('sorts accounts by type in a stable order', () => {
    const shuffled = ['credit_card', 'cash', 'checking', 'savings']
    expect([...shuffled].sort(compareAccountTypes)).toEqual([
      'checking',
      'savings',
      'cash',
      'credit_card',
    ])
  })

  it('rejects anything else', () => {
    expect(isAccountType('investment')).toBe(false)
    expect(isAccountType(7)).toBe(false)
    expect(() => accountType('loan')).toThrow(UnknownAccountTypeError)
  })
})

describe('transaction types', () => {
  it('covers the five MVP kinds', () => {
    expect([...TRANSACTION_TYPES]).toEqual([
      'expense',
      'income',
      'transfer',
      'adjustment',
      'opening_balance',
    ])
  })

  it('rejects anything else', () => {
    expect(isTransactionType('investment')).toBe(false)
    expect(isTransactionType(null)).toBe(false)
    expect(isTransactionType('expense')).toBe(true)
  })
})

describe('ledger invariants', () => {
  it('refuses a transaction with no lines', () => {
    expect(checkLedgerTransaction({ type: 'expense', lines: [] })).toEqual({
      ok: false,
      violation: 'noLines',
    })
  })

  it('refuses a zero-amount line, whatever the kind', () => {
    for (const type of TRANSACTION_TYPES) {
      expect(checkLedgerTransaction({ type, lines: [line('a', '0')] }), type).toEqual({
        ok: false,
        violation: 'zeroAmount',
      })
    }
  })

  it('refuses lines in different currencies', () => {
    expect(
      checkLedgerTransaction({
        type: 'transfer',
        lines: [
          { accountId: 'a', amount: tl('-100') },
          { accountId: 'b', amount: Money.of('100', 'USD') },
        ],
      }),
    ).toEqual({ ok: false, violation: 'mixedCurrency' })
  })

  describe('expense', () => {
    it('accepts a single negative line', () => {
      expect(checkLedgerTransaction({ type: 'expense', lines: [line('a', '-85')] })).toEqual({
        ok: true,
      })
    })

    it('accepts a split across categories on one account', () => {
      // The 1,600 TL supermarket split from PLAN §20, phase 5.
      const lines: LedgerLine[] = [
        { accountId: 'a', amount: tl('-1200'), categoryId: 'groceries' },
        { accountId: 'a', amount: tl('-300'), categoryId: 'household' },
        { accountId: 'a', amount: tl('-100'), categoryId: 'personalCare' },
      ]
      expect(checkLedgerTransaction({ type: 'expense', lines })).toEqual({ ok: true })
      expect(
        accountBalance(
          lines.map((l) => l.amount),
          'TRY',
        ).toDto(),
      ).toEqual({
        amount: '-1600.00',
        currency: 'TRY',
      })
    })

    it('refuses a positive line: a refund is income in the same category', () => {
      expect(
        checkLedgerTransaction({ type: 'expense', lines: [line('a', '-100'), line('a', '20')] }),
      ).toEqual({ ok: false, violation: 'expenseMustBeNegative' })
    })

    it('refuses a split spread over two accounts', () => {
      expect(
        checkLedgerTransaction({ type: 'expense', lines: [line('a', '-100'), line('b', '-20')] }),
      ).toEqual({ ok: false, violation: 'splitNeedsOneAccount' })
    })
  })

  describe('income', () => {
    it('accepts positive lines on one account', () => {
      expect(
        checkLedgerTransaction({ type: 'income', lines: [line('a', '50000'), line('a', '3500')] }),
      ).toEqual({ ok: true })
    })

    it('refuses a negative line', () => {
      expect(checkLedgerTransaction({ type: 'income', lines: [line('a', '-50000')] })).toEqual({
        ok: false,
        violation: 'incomeMustBePositive',
      })
    })

    it('refuses two accounts', () => {
      expect(
        checkLedgerTransaction({ type: 'income', lines: [line('a', '100'), line('b', '20')] }),
      ).toEqual({ ok: false, violation: 'splitNeedsOneAccount' })
    })
  })

  describe('transfer', () => {
    it('accepts two lines on two accounts that net to zero', () => {
      expect(
        checkLedgerTransaction({
          type: 'transfer',
          lines: [line('a', '-10000'), line('b', '10000')],
        }),
      ).toEqual({ ok: true })
    })

    it('refuses anything other than two lines', () => {
      expect(checkLedgerTransaction({ type: 'transfer', lines: [line('a', '-100')] })).toEqual({
        ok: false,
        violation: 'transferNeedsTwoLines',
      })
      expect(
        checkLedgerTransaction({
          type: 'transfer',
          lines: [line('a', '-100'), line('b', '60'), line('c', '40')],
        }),
      ).toEqual({ ok: false, violation: 'transferNeedsTwoLines' })
    })

    it('refuses a transfer to the same account', () => {
      expect(
        checkLedgerTransaction({ type: 'transfer', lines: [line('a', '-100'), line('a', '100')] }),
      ).toEqual({ ok: false, violation: 'transferNeedsTwoAccounts' })
    })

    it('refuses a transfer that creates or destroys money', () => {
      expect(
        checkLedgerTransaction({ type: 'transfer', lines: [line('a', '-100'), line('b', '90')] }),
      ).toEqual({ ok: false, violation: 'transferMustNet' })
    })
  })

  describe('adjustment and opening balance', () => {
    it('accept exactly one line of either sign', () => {
      for (const type of ['adjustment', 'opening_balance'] as const) {
        expect(checkLedgerTransaction({ type, lines: [line('a', '24850')] }), type).toEqual({
          ok: true,
        })
        expect(checkLedgerTransaction({ type, lines: [line('a', '-4860')] }), type).toEqual({
          ok: true,
        })
      }
    })

    it('refuse more than one line', () => {
      for (const type of ['adjustment', 'opening_balance'] as const) {
        expect(
          checkLedgerTransaction({ type, lines: [line('a', '100'), line('b', '100')] }),
          type,
        ).toEqual({ ok: false, violation: 'singleLineRequired' })
      }
    })
  })

  it('throws the violation when asserted', () => {
    expect(() => assertLedgerTransaction({ type: 'expense', lines: [] })).toThrow(
      LedgerInvariantError,
    )
    try {
      assertLedgerTransaction({ type: 'transfer', lines: [line('a', '-100'), line('b', '90')] })
      expect.unreachable()
    } catch (error) {
      expect((error as LedgerInvariantError).violation).toBe('transferMustNet')
    }
    expect(() =>
      assertLedgerTransaction({ type: 'expense', lines: [line('a', '-1')] }),
    ).not.toThrow()
  })
})

describe('balances', () => {
  it('reproduces the mockup opening balance exactly', () => {
    // PLAN §20, phase 4 DoD: an account opened with 24,850 TL shows exactly that.
    expect(accountBalance([tl('24850')], 'TRY').toDto()).toEqual({
      amount: '24850.00',
      currency: 'TRY',
    })
  })

  it('answers zero in the account currency when there are no lines', () => {
    expect(accountBalance([], 'TRY').toDto()).toEqual({ amount: '0.00', currency: 'TRY' })
  })

  it('sums an account history to the kuruş', () => {
    const amounts = ['24850', '-85', '-642.40', '-412.50', '-920', '4000'].map(tl)
    expect(accountBalance(amounts, 'TRY').toDto()).toEqual({
      amount: '26790.10',
      currency: 'TRY',
    })
  })

  it('leaves a card balance negative while money is owed', () => {
    expect(accountBalance([tl('-4860')], 'TRY').amount.isNegative()).toBe(true)
  })
})

describe('net worth', () => {
  const accounts = [
    { balance: tl('24850'), type: 'checking', includeInNetWorth: true },
    { balance: tl('650000'), type: 'savings', includeInNetWorth: true },
    { balance: tl('1250'), type: 'cash', includeInNetWorth: true },
    { balance: tl('-4860'), type: 'credit_card', includeInNetWorth: true },
  ] as const

  it('is assets minus liabilities', () => {
    expect(netWorth(accounts, 'TRY').toDto()).toEqual({ amount: '671240.00', currency: 'TRY' })
  })

  it('leaves out accounts the user excluded', () => {
    const excluded = accounts.map((account) =>
      account.type === 'savings' ? { ...account, includeInNetWorth: false } : account,
    )
    expect(netWorth(excluded, 'TRY').toDto()).toEqual({ amount: '21240.00', currency: 'TRY' })
  })

  it('is zero with no accounts', () => {
    expect(netWorth([], 'TRY').toDto()).toEqual({ amount: '0.00', currency: 'TRY' })
  })
})

describe('reconcile', () => {
  it('is the difference the statement says is missing', () => {
    expect(reconcileAdjustment(tl('24850'), tl('24910.50')).toDto()).toEqual({
      amount: '60.50',
      currency: 'TRY',
    })
  })

  it('is negative when Mizan recorded more than the statement shows', () => {
    expect(reconcileAdjustment(tl('24850'), tl('24000')).toDto()).toEqual({
      amount: '-850.00',
      currency: 'TRY',
    })
  })

  it('is zero when they already agree, so no adjustment is written', () => {
    expect(reconcileAdjustment(tl('24850'), tl('24850')).isZero()).toBe(true)
  })

  it('rounds to the currency minor units', () => {
    expect(reconcileAdjustment(tl('0'), Money.of('10.005', 'TRY')).toDto()).toEqual({
      amount: '10.01',
      currency: 'TRY',
    })
  })
})

describe('opening balance line', () => {
  it('is omitted for a zero balance', () => {
    expect(openingBalanceLine('a', tl('0'))).toBeNull()
  })

  it('carries the rounded amount and no category', () => {
    expect(openingBalanceLine('a', Money.of('24850.004', 'TRY'))).toEqual({
      accountId: 'a',
      amount: tl('24850.00'),
      categoryId: null,
      goalId: null,
    })
  })
})

describe('account currency', () => {
  it('allows only the workspace base currency in the MVP', () => {
    expect(isAllowedAccountCurrency('TRY', 'TRY')).toBe(true)
    expect(isAllowedAccountCurrency('USD', 'TRY')).toBe(false)
  })
})

/* --------------------------------------------------------------- properties */

const amountArb = fc
  .integer({ min: -100_000_000, max: 100_000_000 })
  .filter((cents) => cents !== 0)
  .map((cents) => Money.fromMinor(BigInt(cents), 'TRY'))

describe('properties', () => {
  it('a balance is the sum of its lines, in any order', () => {
    fc.assert(
      fc.property(fc.array(amountArb, { maxLength: 40 }), (amounts) => {
        const forwards = accountBalance(amounts, 'TRY')
        const backwards = accountBalance([...amounts].reverse(), 'TRY')
        expect(forwards.equals(backwards)).toBe(true)
      }),
    )
  })

  it('a transfer never changes the total across both accounts', () => {
    fc.assert(
      fc.property(amountArb, (amount) => {
        const moved = amount.abs()
        const lines: LedgerLine[] = [
          { accountId: 'a', amount: moved.negate() },
          { accountId: 'b', amount: moved },
        ]
        expect(checkLedgerTransaction({ type: 'transfer', lines })).toEqual({ ok: true })
        expect(accountBalance([moved.negate(), moved], 'TRY').isZero()).toBe(true)
      }),
    )
  })

  it('reconciling then applying the adjustment always lands on the statement', () => {
    fc.assert(
      fc.property(fc.array(amountArb, { maxLength: 20 }), amountArb, (history, statement) => {
        const derived = accountBalance(history, 'TRY')
        const adjustment = reconcileAdjustment(derived, statement)
        expect(accountBalance([...history, adjustment], 'TRY').equals(statement)).toBe(true)
      }),
    )
  })

  it('an adjustment is zero exactly when nothing is missing', () => {
    fc.assert(
      fc.property(fc.array(amountArb, { maxLength: 20 }), (history) => {
        const derived = accountBalance(history, 'TRY')
        expect(reconcileAdjustment(derived, derived).isZero()).toBe(true)
      }),
    )
  })

  it('accepts every expense whose lines are all negative on one account', () => {
    fc.assert(
      fc.property(fc.array(amountArb, { minLength: 1, maxLength: 8 }), (amounts) => {
        const lines = amounts.map((amount) => ({ accountId: 'a', amount: amount.abs().negate() }))
        expect(checkLedgerTransaction({ type: 'expense', lines }).ok).toBe(true)
      }),
    )
  })

  it('never accepts a transaction containing a zero line', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TRANSACTION_TYPES),
        fc.array(amountArb, { maxLength: 4 }),
        (type, amounts) => {
          const lines = [
            ...amounts.map((amount, index) => ({ accountId: `a${index}`, amount })),
            { accountId: 'z', amount: tl('0') },
          ]
          expect(checkLedgerTransaction({ type, lines }).ok).toBe(false)
        },
      ),
    )
  })
})

/** A line whose account is known to be on- or off-budget, which is what the category rules need. */
const budgetLine = (
  accountId: string,
  amount: string,
  onBudget: boolean,
  categoryId?: string,
): LedgerLine => ({
  accountId,
  amount: tl(amount),
  onBudget,
  ...(categoryId ? { categoryId } : {}),
})

describe('categories on a transaction', () => {
  it('requires a category on an on-budget expense', () => {
    expect(
      checkLedgerTransaction({ type: 'expense', lines: [budgetLine('a', '-85', true)] }),
    ).toEqual({ ok: false, violation: 'categoryRequired' })

    expect(
      checkLedgerTransaction({
        type: 'expense',
        lines: [budgetLine('a', '-85', true, 'diningOut')],
      }),
    ).toEqual({ ok: true })
  })

  it('requires a category on every part of a split', () => {
    expect(
      checkLedgerTransaction({
        type: 'expense',
        lines: [budgetLine('a', '-1200', true, 'groceries'), budgetLine('a', '-400', true)],
      }),
    ).toEqual({ ok: false, violation: 'categoryRequired' })
  })

  it('requires a category on on-budget income', () => {
    expect(
      checkLedgerTransaction({ type: 'income', lines: [budgetLine('a', '50000', true)] }),
    ).toEqual({ ok: false, violation: 'categoryRequired' })

    expect(
      checkLedgerTransaction({ type: 'income', lines: [budgetLine('a', '50000', true, 'salary')] }),
    ).toEqual({ ok: true })
  })

  it('asks nothing of an off-budget account', () => {
    expect(
      checkLedgerTransaction({ type: 'expense', lines: [budgetLine('x', '-85', false)] }),
    ).toEqual({ ok: true })
  })

  it('asks nothing when the caller did not say which accounts are on budget', () => {
    // Opening balances and reconciliations build their lines this way, and are never categorized.
    expect(checkLedgerTransaction({ type: 'expense', lines: [line('a', '-85')] })).toEqual({
      ok: true,
    })
  })

  it('leaves an on-budget to on-budget transfer uncategorized', () => {
    // §10: the money is still inside the budget, so a category would count spending twice.
    expect(
      checkLedgerTransaction({
        type: 'transfer',
        lines: [budgetLine('a', '-10000', true), budgetLine('b', '10000', true)],
      }),
    ).toEqual({ ok: true })

    expect(
      checkLedgerTransaction({
        type: 'transfer',
        lines: [budgetLine('a', '-10000', true, 'savingsTransfer'), budgetLine('b', '10000', true)],
      }),
    ).toEqual({ ok: false, violation: 'transferCategoryNotAllowed' })
  })

  it('requires a category on the on-budget side of a transfer that leaves the budget', () => {
    expect(
      checkLedgerTransaction({
        type: 'transfer',
        lines: [budgetLine('a', '-10000', true), budgetLine('x', '10000', false)],
      }),
    ).toEqual({ ok: false, violation: 'transferNeedsCategory' })

    expect(
      checkLedgerTransaction({
        type: 'transfer',
        lines: [
          budgetLine('a', '-10000', true, 'investmentContribution'),
          budgetLine('x', '10000', false),
        ],
      }),
    ).toEqual({ ok: true })
  })

  it('refuses a category on the off-budget side of that transfer', () => {
    expect(
      checkLedgerTransaction({
        type: 'transfer',
        lines: [
          budgetLine('a', '-10000', true, 'investmentContribution'),
          budgetLine('x', '10000', false, 'investmentContribution'),
        ],
      }),
    ).toEqual({ ok: false, violation: 'transferCategoryNotAllowed' })
  })

  it('leaves a transfer between two off-budget accounts alone', () => {
    expect(
      checkLedgerTransaction({
        type: 'transfer',
        lines: [budgetLine('x', '-10000', false), budgetLine('y', '10000', false)],
      }),
    ).toEqual({ ok: true })
  })
})

describe('splits', () => {
  it('reports what is left to assign while the 1,600 TL split is entered', () => {
    const total = tl('1600')
    expect(splitRemainder(total, []).toDto().amount).toBe('1600.00')
    expect(splitRemainder(total, [tl('1200')]).toDto().amount).toBe('400.00')
    expect(splitRemainder(total, [tl('1200'), tl('300')]).toDto().amount).toBe('100.00')
    expect(splitRemainder(total, [tl('1200'), tl('300'), tl('100')]).isZero()).toBe(true)
  })

  it('goes negative when the parts overshoot', () => {
    expect(splitRemainder(tl('1600'), [tl('1200'), tl('500')]).toDto().amount).toBe('-100.00')
  })

  it('compares magnitudes, so the signs of an expense do not matter', () => {
    expect(splitRemainder(tl('-1600'), [tl('-1200'), tl('-400')]).isZero()).toBe(true)
    expect(splitRemainder(tl('-1600'), [tl('1200'), tl('400')]).isZero()).toBe(true)
  })

  it('is complete only when the parts account for the whole amount', () => {
    expect(isSplitComplete(tl('1600'), [tl('1200'), tl('400')])).toBe(true)
    expect(isSplitComplete(tl('1600'), [tl('1200')])).toBe(false)
    // No parts at all is not a complete split of zero; it is an empty split.
    expect(isSplitComplete(tl('0'), [])).toBe(false)
  })

  it('splits that allocate the whole amount always balance', () => {
    fc.assert(
      fc.property(fc.array(amountArb, { minLength: 1, maxLength: 8 }), (parts) => {
        const total = Money.sum(
          parts.map((part) => part.abs()),
          'TRY',
        )
        expect(isSplitComplete(total, parts)).toBe(true)
      }),
    )
  })
})
