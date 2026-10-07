import type { AccountDto, AccountListResponse } from '@mizan/contracts'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { axeViolations, renderApp, setLanguage } from '../../test/render'
import { accountHandlers, TEST_ACCOUNT_LIST, TEST_ACCOUNTS } from '../../test/accounts'
import { sessionHandlers } from '../../test/session'

const creates: unknown[] = []
const patches: unknown[] = []
const reconciles: unknown[] = []
const archives: string[] = []

let list: AccountListResponse = TEST_ACCOUNT_LIST

const server = setupServer(
  http.get('*/api/v1/health', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
  ...sessionHandlers(),
  ...accountHandlers(),
  http.post('*/api/v1/accounts', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    creates.push(body)
    const created: AccountDto = {
      id: typeof body.id === 'string' ? body.id : '019a2c1e-0000-7000-8000-0000000000ff',
      name: String(body.name),
      type: body.type as AccountDto['type'],
      currency: 'TRY',
      institution: typeof body.institution === 'string' ? body.institution : null,
      onBudget: true,
      includeInNetWorth: true,
      sortOrder: 9,
      archivedAt: null,
      balance: { amount: '0.00', currency: 'TRY' },
    }
    return HttpResponse.json(created, { status: 201 })
  }),
  http.patch('*/api/v1/accounts/:id', async ({ request, params }) => {
    patches.push({ id: params.id, body: await request.json() })
    return HttpResponse.json(TEST_ACCOUNTS[0])
  }),
  http.post('*/api/v1/accounts/:id/archive', ({ params }) => {
    archives.push(String(params.id))
    return HttpResponse.json({ ...TEST_ACCOUNTS[0], archivedAt: '2026-10-22T08:58:00.000Z' })
  }),
  http.post('*/api/v1/accounts/:id/reconcile', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    reconciles.push(body)
    return HttpResponse.json({
      account: { ...TEST_ACCOUNTS[0], balance: body.statementBalance },
      adjustment: { amount: '60.50', currency: 'TRY' },
    })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  list = TEST_ACCOUNT_LIST
  creates.length = 0
  patches.length = 0
  reconciles.length = 0
  archives.length = 0
  await setLanguage('en')
})
afterAll(() => server.close())

const panel = (name: string) => screen.getByRole<HTMLElement>('region', { name })

describe('the accounts list', () => {
  it('groups the accounts and shows each balance as the API reported it', async () => {
    renderApp('/accounts')
    await screen.findByRole('heading', { level: 1, name: 'Accounts' })

    const bank = await screen.findByText('Bank accounts')
    expect(bank).toBeInTheDocument()
    expect(screen.getByText('Cash', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText('Credit cards')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /Garanti BBVA/ })).toBeInTheDocument()
    expect(screen.getByText('₺24,850.00')).toBeInTheDocument()
    // A card balance is negative and coloured as such. It appears twice: the row and the
    // group total, which is the one card.
    const owed = screen.getAllByText('−₺4,860.00')
    expect(owed).toHaveLength(2)
    expect(owed[0]).toHaveAttribute('data-sign', 'negative')
  })

  it('shows net worth as assets minus liabilities', async () => {
    renderApp('/accounts')
    await screen.findByRole('heading', { level: 1, name: 'Accounts' })
    const netWorth = await screen.findByText('Net worth')
    expect(netWorth).toBeInTheDocument()
    expect(screen.getAllByText('₺671,240.00').length).toBeGreaterThan(0)
  })

  it('invites the first account when there are none', async () => {
    server.use(
      http.get('*/api/v1/accounts', () =>
        HttpResponse.json({
          accounts: [],
          netWorth: { amount: '0.00', currency: 'TRY' },
          onBudgetTotal: { amount: '0.00', currency: 'TRY' },
        }),
      ),
    )
    renderApp('/accounts')
    expect(await screen.findByText('No accounts yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add account' }).length).toBeGreaterThan(0)
  })

  it('reports a failure to load instead of showing an empty list', async () => {
    server.use(
      http.get('*/api/v1/accounts', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Internal Server Error', status: 500 },
          { status: 500 },
        ),
      ),
    )
    renderApp('/accounts')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your accounts.')
  })

  it('asks the API for archived accounts only when told to', async () => {
    const urls: string[] = []
    server.use(
      http.get('*/api/v1/accounts', ({ request }) => {
        urls.push(new URL(request.url).search)
        return HttpResponse.json(list)
      }),
    )
    renderApp('/accounts')
    await screen.findByRole('heading', { level: 1, name: 'Accounts' })
    await waitFor(() => expect(urls).toContain('?includeArchived=false'))

    await userEvent.click(screen.getByRole('button', { name: 'Show archived' }))
    await waitFor(() => expect(urls).toContain('?includeArchived=true'))
  })

  it('has no accessibility violations', async () => {
    const { container } = renderApp('/accounts')
    await screen.findByRole('heading', { level: 1, name: 'Accounts' })
    await screen.findByText('Net worth')
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('adding an account', () => {
  async function openForm() {
    renderApp('/accounts')
    await screen.findByRole('heading', { level: 1, name: 'Accounts' })
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }))
    return screen.findByRole('dialog')
  }

  it('sends the name, type and opening balance, with a client-generated id', async () => {
    const dialog = await openForm()

    await userEvent.type(within(dialog).getByLabelText('Account name'), 'Garanti BBVA')
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'Current account')
    await userEvent.type(within(dialog).getByLabelText('Bank or last four digits'), '··4471')
    await userEvent.type(within(dialog).getByLabelText('Balance today'), '24.850,00')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add account' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    const body = creates[0] as Record<string, unknown>
    expect(body).toMatchObject({
      name: 'Garanti BBVA',
      type: 'checking',
      institution: '··4471',
      // Never a float: the amount travels as a decimal string with its currency.
      openingBalance: { amount: '24850.00', currency: 'TRY' },
    })
    expect(body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('leaves the opening balance out when the field is empty', async () => {
    const dialog = await openForm()
    await userEvent.type(within(dialog).getByLabelText('Account name'), 'Empty account')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add account' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).not.toHaveProperty('openingBalance')
  })

  it('accepts a negative opening balance for a credit card', async () => {
    const dialog = await openForm()
    await userEvent.type(within(dialog).getByLabelText('Account name'), 'Bonus card')
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'Credit card')
    await userEvent.type(within(dialog).getByLabelText('Balance today'), '-4860')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add account' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toMatchObject({
      type: 'credit_card',
      openingBalance: { amount: '-4860.00', currency: 'TRY' },
    })
  })

  it('refuses a blank name before sending anything', async () => {
    const dialog = await openForm()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add account' }))
    expect(await screen.findByText('Give the account a name.')).toBeInTheDocument()
    expect(creates).toHaveLength(0)
  })

  it('shows what the API said when it refuses the account', async () => {
    server.use(
      http.post('*/api/v1/accounts', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'Accounts must use the workspace base currency (TRY).',
          },
          { status: 400 },
        ),
      ),
    )
    const dialog = await openForm()
    await userEvent.type(within(dialog).getByLabelText('Account name'), 'Dollars')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('workspace base currency')
  })

  it('has no accessibility violations', async () => {
    renderApp('/accounts')
    await screen.findByRole('heading', { level: 1, name: 'Accounts' })
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }))
    await screen.findByRole('dialog')
    expect(await axeViolations(document.body)).toEqual([])
  })
})

describe('one account', () => {
  const detailPath = `/accounts/${TEST_ACCOUNTS[0]!.id}`

  it('shows the derived balance and the recent movements', async () => {
    renderApp(detailPath)
    await screen.findByRole('heading', { level: 1, name: 'Garanti BBVA' })

    expect(within(panel('Balance')).getByText('₺24,850.00')).toBeInTheDocument()
    const activity = panel('Recent activity')
    expect(within(activity).getByText('Opening balance')).toBeInTheDocument()
    // Dates read the way each language writes them, never as a raw YYYY-MM-DD.
    expect(within(activity).getByText('1 Oct 2026')).toBeInTheDocument()
    expect(within(activity).getByText('Bank fee')).toBeInTheDocument()
    expect(within(activity).getByText('+₺24,850.00')).toBeInTheDocument()
    expect(within(activity).getByText('−₺60.50')).toBeInTheDocument()
  })

  it('says so when the id is not an account', async () => {
    renderApp('/accounts/019a2c1e-0000-7000-8000-00000000ffff')
    expect(await screen.findByText('That account no longer exists')).toBeInTheDocument()
  })

  it('says so when the URL holds something that is not an id, without calling the API', async () => {
    renderApp('/accounts/not-a-uuid')
    expect(await screen.findByText('That account no longer exists')).toBeInTheDocument()
  })

  it('renames the account without touching its type', async () => {
    renderApp(detailPath)
    await screen.findByRole('heading', { level: 1, name: 'Garanti BBVA' })
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog')
    // The type cannot change once movements exist against it.
    expect(within(dialog).getByLabelText('Type')).toBeDisabled()

    const name = within(dialog).getByLabelText('Account name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Garanti')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toEqual({
      id: TEST_ACCOUNTS[0]!.id,
      body: { name: 'Garanti', institution: '··4471' },
    })
  })

  it('previews the reconciliation difference before sending it', async () => {
    renderApp(detailPath)
    await screen.findByRole('heading', { level: 1, name: 'Garanti BBVA' })
    await userEvent.click(screen.getByRole('button', { name: 'Reconcile' }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Balance on your statement'), '24910,50')

    // The same domain function the API uses: 24,910.50 − 24,850.00.
    expect(await within(dialog).findByText('+₺60.50')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Reconcile' }))
    await waitFor(() => expect(reconciles).toHaveLength(1))
    expect(reconciles[0]).toEqual({
      statementBalance: { amount: '24910.50', currency: 'TRY' },
    })
  })

  it('cannot be reconciled until a statement balance is typed', async () => {
    renderApp(detailPath)
    await screen.findByRole('heading', { level: 1, name: 'Garanti BBVA' })
    await userEvent.click(screen.getByRole('button', { name: 'Reconcile' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Reconcile' })).toBeDisabled()
  })

  it('confirms before archiving', async () => {
    renderApp(detailPath)
    await screen.findByRole('heading', { level: 1, name: 'Garanti BBVA' })
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/keeps every transaction/)).toBeInTheDocument()
    expect(archives).toHaveLength(0)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(archives).toEqual([TEST_ACCOUNTS[0]!.id]))
  })

  it('has no accessibility violations', async () => {
    const { container } = renderApp(detailPath)
    await screen.findByRole('heading', { level: 1, name: 'Garanti BBVA' })
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('Turkish', () => {
  it('formats balances and labels the Turkish way', async () => {
    await setLanguage('tr')
    renderApp('/accounts')
    await screen.findByRole('heading', { level: 1, name: 'Hesaplar' })
    expect(await screen.findByText('Banka hesapları')).toBeInTheDocument()
    expect(screen.getByText('₺24.850,00')).toBeInTheDocument()
  })

  it('writes dates with Turkish month names', async () => {
    await setLanguage('tr')
    renderApp(`/accounts/${TEST_ACCOUNTS[0]!.id}`)
    await screen.findByRole('heading', { level: 1, name: 'Garanti BBVA' })
    expect(await screen.findByText('1 Eki 2026')).toBeInTheDocument()
  })
})
