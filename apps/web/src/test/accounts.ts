import type { AccountDto, AccountListResponse, LedgerEntryDto } from '@mizan/contracts'
import { plainDate } from '@mizan/domain'
import { http, HttpResponse } from 'msw'

/** The four accounts the mockups show, as the API would return them. */
export const TEST_ACCOUNTS: AccountDto[] = [
  {
    id: '019a2c1e-0000-7000-8000-0000000000a1',
    name: 'Garanti BBVA',
    type: 'checking',
    currency: 'TRY',
    institution: '··4471',
    onBudget: true,
    includeInNetWorth: true,
    sortOrder: 0,
    archivedAt: null,
    balance: { amount: '24850.00', currency: 'TRY' },
  },
  {
    id: '019a2c1e-0000-7000-8000-0000000000a2',
    name: 'House deposit',
    type: 'savings',
    currency: 'TRY',
    institution: 'İş Bankası',
    onBudget: true,
    includeInNetWorth: true,
    sortOrder: 1,
    archivedAt: null,
    balance: { amount: '650000.00', currency: 'TRY' },
  },
  {
    id: '019a2c1e-0000-7000-8000-0000000000a3',
    name: 'Cash',
    type: 'cash',
    currency: 'TRY',
    institution: null,
    onBudget: true,
    includeInNetWorth: true,
    sortOrder: 2,
    archivedAt: null,
    balance: { amount: '1250.00', currency: 'TRY' },
  },
  {
    id: '019a2c1e-0000-7000-8000-0000000000a4',
    name: 'Bonus card',
    type: 'credit_card',
    currency: 'TRY',
    institution: '··9020',
    onBudget: true,
    includeInNetWorth: true,
    sortOrder: 3,
    archivedAt: null,
    balance: { amount: '-4860.00', currency: 'TRY' },
  },
]

export const TEST_ACCOUNT_LIST: AccountListResponse = {
  accounts: TEST_ACCOUNTS,
  netWorth: { amount: '671240.00', currency: 'TRY' },
  onBudgetTotal: { amount: '671240.00', currency: 'TRY' },
}

export const TEST_ENTRIES: LedgerEntryDto[] = [
  {
    id: '019a2c1e-0000-7000-8000-0000000000e1',
    transactionId: '019a2c1e-0000-7000-8000-0000000000b1',
    date: plainDate('2026-10-22'),
    type: 'adjustment',
    payee: null,
    memo: 'Bank fee',
    amount: { amount: '-60.50', currency: 'TRY' },
  },
  {
    id: '019a2c1e-0000-7000-8000-0000000000e2',
    transactionId: '019a2c1e-0000-7000-8000-0000000000b2',
    date: plainDate('2026-10-01'),
    type: 'opening_balance',
    payee: null,
    memo: null,
    amount: { amount: '24850.00', currency: 'TRY' },
  },
]

/** Read-only handlers for the account endpoints. Tests that mutate add their own on top. */
export function accountHandlers(list: AccountListResponse = TEST_ACCOUNT_LIST) {
  return [
    http.get('*/api/v1/accounts', () => HttpResponse.json(list)),
    http.get('*/api/v1/accounts/:id', ({ params }) => {
      const account = list.accounts.find((candidate) => candidate.id === params.id)
      if (!account) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Not Found', status: 404, detail: 'No such account.' },
          { status: 404 },
        )
      }
      return HttpResponse.json({ account, entries: TEST_ENTRIES })
    }),
  ]
}
