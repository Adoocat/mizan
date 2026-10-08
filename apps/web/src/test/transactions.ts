import type { TransactionDto, TransactionListResponse } from '@mizan/contracts'
import { plainDate } from '@mizan/domain'
import { http, HttpResponse } from 'msw'
import { TEST_ACCOUNTS } from './accounts'
import { testCategory } from './categories'

const tl = (amount: string) => ({ amount, currency: 'TRY' as const })
const id = (suffix: string) => `019a2c1e-0000-7000-8000-0000000t${suffix}`.replace('t', 'd')

const CHECKING = TEST_ACCOUNTS[0]!.id
const CARD = TEST_ACCOUNTS[3]!.id

/** The transactions the mockup shows, as the API would return them. */
export const TEST_TRANSACTIONS: TransactionDto[] = [
  {
    id: id('0001'),
    type: 'expense',
    date: plainDate('2026-10-22'),
    payee: 'MİGROS KADIKÖY',
    notes: null,
    status: 'cleared',
    source: 'manual',
    lines: [
      {
        id: id('1001'),
        accountId: CARD,
        categoryId: testCategory('groceries').id,
        amount: tl('-1200.00'),
        memo: 'Weekly shop',
      },
      {
        id: id('1002'),
        accountId: CARD,
        categoryId: testCategory('personalCare').id,
        amount: tl('-400.00'),
        memo: null,
      },
    ],
    total: tl('-1600.00'),
    deletedAt: null,
  },
  {
    id: id('0002'),
    type: 'expense',
    date: plainDate('2026-10-22'),
    payee: 'Şişli Çarşı',
    notes: null,
    status: 'cleared',
    source: 'manual',
    lines: [
      {
        id: id('1003'),
        accountId: CHECKING,
        categoryId: testCategory('diningOut').id,
        amount: tl('-240.50'),
        memo: null,
      },
    ],
    total: tl('-240.50'),
    deletedAt: null,
  },
  {
    id: id('0003'),
    type: 'expense',
    date: plainDate('2026-10-21'),
    payee: 'Unknown card payment',
    notes: null,
    status: 'cleared',
    source: 'manual',
    lines: [
      { id: id('1004'), accountId: CHECKING, categoryId: null, amount: tl('-85.00'), memo: null },
    ],
    total: tl('-85.00'),
    deletedAt: null,
  },
  {
    id: id('0004'),
    type: 'income',
    date: plainDate('2026-10-01'),
    payee: 'Employer',
    notes: null,
    status: 'cleared',
    source: 'manual',
    lines: [
      {
        id: id('1005'),
        accountId: CHECKING,
        categoryId: testCategory('salary').id,
        amount: tl('50000.00'),
        memo: null,
      },
    ],
    total: tl('50000.00'),
    deletedAt: null,
  },
]

export const TEST_TRANSACTION_LIST: TransactionListResponse = {
  transactions: TEST_TRANSACTIONS,
  nextCursor: null,
  summary: {
    income: tl('50000.00'),
    spending: tl('-1925.50'),
    transfers: tl('0.00'),
    needsReview: 1,
    matched: 4,
  },
}

/**
 * A handler that applies the filters the page sends, so a test can assert on what the URL does
 * rather than on what the component asked for.
 */
export function transactionHandlers(list: TransactionListResponse = TEST_TRANSACTION_LIST) {
  return [
    http.get('*/api/v1/transactions', ({ request }) => {
      const url = new URL(request.url)
      const view = url.searchParams.get('view') ?? 'all'
      const query = url.searchParams.get('q')?.toLowerCase()
      const categoryIds = url.searchParams.getAll('categoryId')

      let rows = list.transactions
      if (view === 'spending') rows = rows.filter((row) => row.type === 'expense')
      if (view === 'income') rows = rows.filter((row) => row.type === 'income')
      if (view === 'transfers') rows = rows.filter((row) => row.type === 'transfer')
      if (view === 'needsReview') {
        rows = rows.filter((row) => row.lines.some((line) => line.categoryId === null))
      }
      if (query) {
        rows = rows.filter((row) => (row.payee ?? '').toLowerCase().includes(query))
      }
      if (categoryIds.length > 0) {
        rows = rows.filter((row) =>
          row.lines.some((line) => line.categoryId && categoryIds.includes(line.categoryId)),
        )
      }

      return HttpResponse.json({
        ...list,
        transactions: rows,
        summary: { ...list.summary, matched: rows.length },
      })
    }),
  ]
}
