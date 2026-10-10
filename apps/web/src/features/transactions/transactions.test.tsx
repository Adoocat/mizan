import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { accountHandlers } from '../../test/accounts'
import { categoryHandlers, testCategory } from '../../test/categories'
import { axeViolations, renderApp, setLanguage } from '../../test/render'
import { sessionHandlers } from '../../test/session'
import { planHandlers } from '../../test/plan'
import { TEST_TRANSACTIONS, transactionHandlers } from '../../test/transactions'

const creates: Record<string, unknown>[] = []
const puts: { id: string; body: Record<string, unknown> }[] = []
const deletes: string[] = []
const restores: string[] = []

const server = setupServer(
  http.get('*/api/v1/health', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
  ...sessionHandlers(),
  ...accountHandlers(),
  ...categoryHandlers(),
  ...transactionHandlers(),
  ...planHandlers(),
  http.post('*/api/v1/transactions', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    creates.push(body)
    return HttpResponse.json(TEST_TRANSACTIONS[0], { status: 201 })
  }),
  http.put('*/api/v1/transactions/:id', async ({ request, params }) => {
    puts.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> })
    return HttpResponse.json(TEST_TRANSACTIONS[0])
  }),
  http.delete('*/api/v1/transactions/:id', ({ params }) => {
    deletes.push(String(params.id))
    return HttpResponse.json({ ...TEST_TRANSACTIONS[0], deletedAt: '2026-10-22T09:00:00.000Z' })
  }),
  http.post('*/api/v1/transactions/:id/restore', ({ params }) => {
    restores.push(String(params.id))
    return HttpResponse.json(TEST_TRANSACTIONS[0])
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  creates.length = 0
  puts.length = 0
  deletes.length = 0
  restores.length = 0
  await setLanguage('en')
})
afterAll(() => server.close())

async function openList(path = '/transactions') {
  const rendered = renderApp(path)
  await screen.findByRole('heading', { level: 1, name: 'Transactions' })
  return rendered
}

describe('the transaction list', () => {
  it('shows the day-grouped rows with their categories', async () => {
    await openList()

    await screen.findByText('MİGROS KADIKÖY')
    // Day headings, from the dates the API returned.
    expect(screen.getByRole('heading', { level: 3, name: '22 Oct 2026' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '1 Oct 2026' })).toBeInTheDocument()

    // A seeded category's name comes from i18next, not from the stored row.
    expect(screen.getByText('Dining out')).toBeInTheDocument()
    // A category the user created shows the name they gave it.
    expect(screen.getByText('Split across 2 categories')).toBeInTheDocument()
  })

  it('totals the whole filtered set in the tiles', async () => {
    await openList()
    const income = await screen.findByRole('region', { name: 'Income' })
    expect(income).toHaveTextContent('₺50,000.00')

    const spending = screen.getByRole('region', { name: 'Spending' })
    expect(spending).toHaveTextContent('₺1,925.50')
  })

  it('flags an uncategorized expense on a budget account', async () => {
    await openList()
    // "Needs review" is also a filter chip and a tile heading, so the badge is read off the row.
    const row = (await screen.findByText('Unknown card payment')).closest('li')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('Needs review')).toBeInTheDocument()
  })

  it('expands a split in place', async () => {
    await openList()
    await screen.findByText('MİGROS KADIKÖY')

    await userEvent.click(screen.getByRole('button', { name: 'Show parts' }))
    expect(await screen.findByText('Weekly shop')).toBeInTheDocument()
    expect(screen.getByText('−₺1,200.00')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Hide parts' }))
    await waitFor(() => expect(screen.queryByText('Weekly shop')).not.toBeInTheDocument())
  })

  it('has no accessibility violations', async () => {
    const { container } = await openList()
    await screen.findByText('MİGROS KADIKÖY')
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('the filters', () => {
  it('puts the view in the URL and narrows the list', async () => {
    const { router } = await openList()
    await screen.findByText('Employer')

    await userEvent.click(screen.getByRole('button', { name: 'Income', pressed: false }))

    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'income' }))
    await waitFor(() => expect(screen.queryByText('Şişli Çarşı')).not.toBeInTheDocument())
    expect(screen.getByText('Employer')).toBeInTheDocument()
  })

  it('reads the filters back out of the URL on load', async () => {
    await openList('/transactions?view=needsReview')
    await screen.findByText('Unknown card payment')
    expect(screen.queryByText('Employer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Needs review', pressed: true })).toBeInTheDocument()
  })

  it('searches by payee', async () => {
    const { router } = await openList()
    await screen.findByText('Şişli Çarşı')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search transactions' }), 'employer')

    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: 'employer' }))
    await waitFor(() => expect(screen.queryByText('Şişli Çarşı')).not.toBeInTheDocument())
  })

  it('filters by category from the menu', async () => {
    const { router } = await openList()
    await screen.findByText('Şişli Çarşı')

    await userEvent.click(screen.getByRole('button', { name: /^Category/ }))
    const menu = screen.getByRole('list', { name: 'Category' })
    await userEvent.click(within(menu).getByRole('checkbox', { name: /Dining out/ }))

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        categoryId: [testCategory('diningOut').id],
      }),
    )
    await waitFor(() => expect(screen.queryByText('Employer')).not.toBeInTheDocument())
  })

  it('clears every filter at once', async () => {
    const { router } = await openList('/transactions?view=income')
    await screen.findByText('Employer')

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    await waitFor(() => expect(router.state.location.search).toEqual({ view: 'all' }))
    expect(await screen.findByText('Şişli Çarşı')).toBeInTheDocument()
  })

  it('offers a way out when nothing matches', async () => {
    await openList('/transactions?view=transfers')
    expect(await screen.findByText('No transactions match these filters')).toBeInTheDocument()
  })
})

describe('quick add', () => {
  async function openQuickAdd() {
    await openList()
    /*
     * Quick add lives in the app shell and has two triggers — the header button and the phone tab
     * bar's +. jsdom loads no CSS, so both are in the tree; either one opens the same form.
     */
    await userEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]!)
    return screen.getByRole('dialog')
  }

  it('records an expense as a positive amount with a category', async () => {
    const dialog = await openQuickAdd()

    await userEvent.type(within(dialog).getByLabelText('Amount'), '85')
    const picker = within(dialog).getByRole('combobox', { name: 'Category' })
    await userEvent.click(picker)
    await userEvent.type(picker, 'dining')
    await userEvent.click(await screen.findByRole('option', { name: /Dining out/ }))
    await userEvent.type(within(dialog).getByLabelText('Payee'), 'Migros')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toMatchObject({
      type: 'expense',
      payee: 'Migros',
      // The form sends a magnitude; the API applies the sign.
      parts: [
        { amount: { amount: '85.00', currency: 'TRY' }, categoryId: testCategory('diningOut').id },
      ],
    })
    // A client-supplied id is what makes a double tap harmless.
    expect(creates[0]!.id).toEqual(expect.any(String))
  })

  it('finds a category by Turkish text folded to ASCII', async () => {
    const dialog = await openQuickAdd()
    const picker = within(dialog).getByRole('combobox', { name: 'Category' })

    await userEvent.click(picker)
    await userEvent.type(picker, 'ogrenci')

    // "Öğrenci indirimi" — folded, `ogrenci` matches it.
    expect(await screen.findByRole('option', { name: /Öğrenci indirimi/ })).toBeInTheDocument()
  })

  it('refuses to save an on-budget expense with no category', async () => {
    const dialog = await openQuickAdd()

    await userEvent.type(within(dialog).getByLabelText('Amount'), '85')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Choose a category.')).toBeInTheDocument()
    expect(creates).toHaveLength(0)
  })

  it('splits an expense across two categories', async () => {
    const dialog = await openQuickAdd()

    await userEvent.type(within(dialog).getAllByLabelText('Amount')[0]!, '1200')
    const first = within(dialog).getAllByRole('combobox', { name: 'Category' })[0]!
    await userEvent.click(first)
    await userEvent.type(first, 'groceries')
    await userEvent.click(await screen.findByRole('option', { name: /Food & groceries/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Split this' }))

    const amounts = within(dialog).getAllByLabelText('Amount')
    expect(amounts).toHaveLength(2)
    await userEvent.type(amounts[1]!, '400')
    const second = within(dialog).getAllByRole('combobox', { name: 'Category' })[1]!
    await userEvent.click(second)
    await userEvent.type(second, 'dining')
    await userEvent.click(await screen.findByRole('option', { name: /Dining out/ }))

    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toMatchObject({
      type: 'expense',
      parts: [
        { amount: { amount: '1200.00', currency: 'TRY' } },
        { amount: { amount: '400.00', currency: 'TRY' } },
      ],
    })
  })

  it('sends a transfer as one amount between two accounts', async () => {
    const dialog = await openQuickAdd()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Transfer' }))
    await userEvent.type(within(dialog).getByLabelText('Amount'), '10000')
    await userEvent.selectOptions(within(dialog).getByLabelText('To'), 'House deposit')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toMatchObject({
      type: 'transfer',
      amount: { amount: '10000.00', currency: 'TRY' },
    })
    // Inside the budget, so no category: the money has not left the plan (§10).
    expect(creates[0]).not.toHaveProperty('categoryId')
  })
})

describe('editing and undo', () => {
  it('opens a row in the form and replaces it', async () => {
    await openList()
    await userEvent.click(await screen.findByText('Şişli Çarşı'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Edit transaction')

    const amount = within(dialog).getByLabelText('Amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '300')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]!.body).toMatchObject({
      type: 'expense',
      parts: [{ amount: { amount: '300.00', currency: 'TRY' } }],
    })
  })

  it('deletes a transaction and offers an undo that restores it', async () => {
    await openList()
    await screen.findByText('Şişli Çarşı')

    await userEvent.click(screen.getByRole('button', { name: 'Delete Şişli Çarşı' }))

    await waitFor(() => expect(deletes).toHaveLength(1))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(restores).toEqual(deletes))
  })
})

describe('Turkish', () => {
  it('translates the screen and the seeded categories', async () => {
    await setLanguage('tr')
    await openListTurkish()

    expect(screen.getByText('Dışarıda yemek')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'İşlem ekle' })[0]).toBeInTheDocument()
  })
})

async function openListTurkish() {
  renderApp('/transactions')
  await screen.findByRole('heading', { level: 1, name: 'İşlemler' })
  await screen.findByText('Şişli Çarşı')
}

describe('the budget impact preview', () => {
  /** Quick add, from the app shell. */
  async function openQuickAdd() {
    const user = userEvent.setup()
    await openList()
    await user.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]!)
    const dialog = await screen.findByRole('dialog')
    /*
     * The form opens on the browser's today; the plan's today comes from the API, in the
     * workspace's time zone. The fixture month is the mockups' 22 October 2026, so the date is
     * set explicitly rather than depending on when the suite happens to run.
     */
    const date = within(dialog).getByLabelText('Date')
    await user.clear(date)
    await user.type(date, '2026-10-22')
    return { user, dialog }
  }

  it('says what an expense would do to its line and to today', async () => {
    const { user, dialog } = await openQuickAdd()

    await user.type(within(dialog).getByRole('textbox', { name: 'Amount' }), '500')
    await user.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await user.click(
      within(screen.getByRole('listbox', { name: 'Category' })).getByRole('option', {
        name: /Food & groceries/,
      }),
    )

    // Groceries has ₺1,150 left of its line; the fixture's date is today.
    const preview = await within(dialog).findByTestId('budget-impact')
    expect(preview).toHaveTextContent('Food & groceries ₺1,150 → ₺650')
    // Spending inside a line that can afford it does not touch what is safe to spend.
    expect(preview).not.toHaveTextContent("today's allowance")
  })

  it('takes the whole amount off today when the pool answers for the category', async () => {
    const { user, dialog } = await openQuickAdd()

    await user.type(within(dialog).getByRole('textbox', { name: 'Amount' }), '85')
    await user.click(within(dialog).getByRole('combobox', { name: 'Category' }))
    await user.click(
      within(screen.getByRole('listbox', { name: 'Category' })).getByRole('option', {
        name: /Dining out/,
      }),
    )

    const preview = await within(dialog).findByTestId('budget-impact')
    // Dining out has no line of its own, so it comes out of the pool and out of today's ₺604.
    expect(preview).toHaveTextContent('Available to spend ₺6,150 → ₺6,065')
    expect(preview).toHaveTextContent("today's allowance ₺604 → ₺519")
  })

  it('says nothing for a transfer', async () => {
    const { user, dialog } = await openQuickAdd()
    await user.click(within(dialog).getByRole('button', { name: 'Transfer' }))
    expect(within(dialog).queryByTestId('budget-impact')).not.toBeInTheDocument()
  })
})
