import type { PlanResponse } from '@mizan/contracts'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { categoryHandlers, testCategory } from '../../test/categories'
import { planHandlers, TEST_PLAN } from '../../test/plan'
import { axeViolations, renderApp, setLanguage } from '../../test/render'
import { sessionHandlers } from '../../test/session'

const puts: Record<string, unknown>[] = []
const copies: { from: string; body: Record<string, unknown> }[] = []
const patches: { id: string; body: Record<string, unknown> }[] = []
const posts: Record<string, unknown>[] = []

const server = setupServer(
  http.get('*/api/v1/health', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
  ...sessionHandlers(),
  ...categoryHandlers(),
  ...planHandlers(),
  http.put('*/api/v1/plans/:start/lines', async ({ request }) => {
    puts.push((await request.json()) as Record<string, unknown>)
    return HttpResponse.json(TEST_PLAN)
  }),
  http.post('*/api/v1/plans/:start/income-items', async ({ request }) => {
    posts.push((await request.json()) as Record<string, unknown>)
    return HttpResponse.json(TEST_PLAN, { status: 201 })
  }),
  http.patch('*/api/v1/plans/:start/income-items/:id', async ({ request, params }) => {
    patches.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> })
    return HttpResponse.json(TEST_PLAN)
  }),
  http.post('*/api/v1/plans/:start/copy-from/:from', async ({ request, params }) => {
    copies.push({
      from: String(params.from),
      body: (await request.json()) as Record<string, unknown>,
    })
    return HttpResponse.json({
      plan: TEST_PLAN,
      copiedLines: 3,
      copiedIncomeItems: 1,
      skippedLines: 0,
    })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  puts.length = 0
  copies.length = 0
  patches.length = 0
  posts.length = 0
  await setLanguage('en')
})
afterAll(() => server.close())

async function openPlan(path = '/plan') {
  const rendered = renderApp(path)
  await screen.findByRole('heading', { level: 1, name: 'Give every lira a job' })
  // The rows arrive with the plan; waiting for one means the page is settled.
  await screen.findByText('Food & groceries')
  return rendered
}

/** The amount field of a row, found by the label the row gives it. */
const allocationFor = (name: string) =>
  screen.getByRole('textbox', { name: `Allocation for ${name}` })

const tile = (name: string) => screen.getByRole('region', { name })

/** The row for the flexible category the fixture leaves to the pool. */
const diningRow = () =>
  screen.getAllByTestId('plan-row').find((row) => row.textContent?.includes('Dining out'))!

describe('the plan', () => {
  it('shows the month, the three totals and the lines', async () => {
    await openPlan()

    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(tile('Income available')).toHaveTextContent('₺46,000')
    expect(tile('Allocated')).toHaveTextContent('₺17,300')
    expect(tile('Left to allocate')).toHaveTextContent('₺28,700')

    // A seeded category reads its name from i18next; one the user made shows their own.
    expect(screen.getByText('Transport')).toBeInTheDocument()
    expect(screen.getByText('Öğrenci indirimi')).toBeInTheDocument()
    expect(allocationFor('Food & groceries')).toHaveValue('6,000.00')
  })

  it('marks the overspent line and says so on its group', async () => {
    await openPlan()
    const rows = screen.getAllByTestId('plan-row')
    const over = rows.filter((row) => row.dataset.status === 'over')

    expect(over).toHaveLength(1)
    expect(over[0]!).toHaveTextContent('Öğrenci indirimi')
    expect(over[0]!).toHaveTextContent('−₺110')
  })

  it('shows a category the pool covers without an amount of its own', async () => {
    await openPlan()
    const dining = diningRow()

    // The row says what covers it, and the button says what pressing it would do instead.
    expect(within(dining).getByText('from pool')).toBeInTheDocument()
    expect(
      within(dining).getByRole('button', { name: 'Give Dining out its own amount' }),
    ).toBeInTheDocument()
    expect(within(dining).queryByRole('textbox')).not.toBeInTheDocument()
    expect(dining).toHaveTextContent('₺2,850')
  })

  it('gives a pooled category its own line when one is asked for', async () => {
    const user = userEvent.setup()
    await openPlan()

    await user.click(
      within(diningRow()).getByRole('button', { name: 'Give Dining out its own amount' }),
    )
    const field = within(diningRow()).getByRole('textbox')
    await user.clear(field)
    await user.type(field, '2600')
    // Allocating to it adds to the plan: 17,300 + 2,600.
    await waitFor(() => expect(tile('Allocated')).toHaveTextContent('₺19,900'))

    await user.tab()
    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({
      target: 'category',
      categoryId: testCategory('diningOut').id,
      planned: { amount: '2600.00', currency: 'TRY' },
    })
  })

  it('updates the totals while an amount is being typed', async () => {
    const user = userEvent.setup()
    await openPlan()

    const field = allocationFor('Food & groceries')
    await user.clear(field)
    await user.type(field, '7000')

    // 17,300 − 6,000 + 7,000, with nothing saved yet.
    await waitFor(() => expect(tile('Allocated')).toHaveTextContent('₺18,300'))
    expect(tile('Left to allocate')).toHaveTextContent('₺27,700')
    expect(puts).toEqual([])
  })

  it('saves the amount when the field is left, with the version it was read at', async () => {
    const user = userEvent.setup()
    await openPlan()

    const field = allocationFor('Food & groceries')
    await user.clear(field)
    await user.type(field, '7000')
    await user.tab()

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({
      target: 'category',
      categoryId: testCategory('groceries').id,
      planned: { amount: '7000.00', currency: 'TRY' },
      version: 1,
    })
  })

  it('saves nothing when the amount has not changed', async () => {
    const user = userEvent.setup()
    await openPlan()

    await user.click(allocationFor('Food & groceries'))
    await user.tab()

    expect(puts).toEqual([])
  })

  it('reverts the draft on Escape', async () => {
    const user = userEvent.setup()
    await openPlan()

    const field = allocationFor('Food & groceries')
    await user.clear(field)
    await user.type(field, '7000')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(tile('Allocated')).toHaveTextContent('₺17,300'))
    expect(puts).toEqual([])
  })

  it('clears a line by emptying its amount', async () => {
    const user = userEvent.setup()
    await openPlan()

    const field = allocationFor('Food & groceries')
    await user.clear(field)
    await user.tab()

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toMatchObject({ planned: { amount: '0.00', currency: 'TRY' } })
  })

  it('allocates to the pool', async () => {
    const user = userEvent.setup()
    await openPlan()

    const field = allocationFor('Available to spend')
    await user.clear(field)
    await user.type(field, '9500')
    await user.tab()

    await waitFor(() => expect(puts).toHaveLength(1))
    expect(puts[0]).toEqual({
      target: 'pool',
      planned: { amount: '9500.00', currency: 'TRY' },
      version: 3,
    })
  })
})

describe('moving between months', () => {
  it('navigates to the previous and next month', async () => {
    const user = userEvent.setup()
    const { router } = await openPlan()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ month: '2026-09-01' }))

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ month: '2026-11-01' }))
  })

  it('reads the month from the URL', async () => {
    const requested: string[] = []
    server.use(
      http.get('*/api/v1/plans/:start', ({ params }) => {
        requested.push(String(params.start))
        return HttpResponse.json(TEST_PLAN)
      }),
    )

    await openPlan('/plan?month=2026-09-01')
    expect(requested).toContain('2026-09-01')
  })
})

describe('copying a month', () => {
  it('copies the previous month and says what it did', async () => {
    const user = userEvent.setup()
    await openPlan()

    await user.click(screen.getByRole('button', { name: 'Copy from Sep' }))

    await waitFor(() => expect(copies).toHaveLength(1))
    expect(copies[0]!.from).toBe('2026-09-01')
    expect(await screen.findByText('Copied 3 allocations from Sep')).toBeInTheDocument()
  })

  it('offers nothing to copy in a workspace with no earlier plan', async () => {
    const fresh: PlanResponse = { ...TEST_PLAN, copyableFrom: null }
    server.use(...planHandlers(fresh))

    await openPlan()
    expect(screen.queryByRole('button', { name: /^Copy from/ })).not.toBeInTheDocument()
  })
})

describe('expected income', () => {
  it('lists the items and marks one received', async () => {
    const user = userEvent.setup()
    await openPlan()

    const panel = screen.getByRole('region', { name: 'Expected income' })
    expect(panel).toHaveTextContent('Salary')
    expect(panel).toHaveTextContent('₺46,000')
    expect(within(panel).getByText('Expected')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Mark received' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]!.body).toEqual({ received: { amount: '46000.00', currency: 'TRY' } })
  })

  it('adds an expected income item', async () => {
    const user = userEvent.setup()
    await openPlan()

    const panel = screen.getByRole('region', { name: 'Expected income' })
    await user.click(within(panel).getByRole('button', { name: 'Add income' }))

    await user.type(within(panel).getByLabelText('Name'), 'Atölye invoice')
    await user.type(within(panel).getByLabelText('Expected amount'), '4000')
    await user.click(within(panel).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      categoryId: testCategory('salary').id,
      label: 'Atölye invoice',
      expected: { amount: '4000.00', currency: 'TRY' },
      expectedDate: '2026-10-01',
    })
  })
})

describe('a closed month', () => {
  const closed: PlanResponse = {
    ...TEST_PLAN,
    period: { ...TEST_PLAN.period, status: 'closed', closedAt: '2026-11-01T06:00:00.000Z' },
  }

  it('says so and allows no edits', async () => {
    server.use(...planHandlers(closed))
    await openPlan()

    expect(
      screen.getByText('This month is closed — reopen it to change the plan'),
    ).toBeInTheDocument()
    expect(allocationFor('Food & groceries')).toBeDisabled()
    // Nothing can be given a line either: the month is history until it is reopened.
    expect(screen.queryByRole('button', { name: /its own amount/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark received' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Copy from/ })).not.toBeInTheDocument()
  })
})

describe('accessibility and language', () => {
  it('has no axe violations', async () => {
    const { container } = await openPlan()
    expect(await axeViolations(container)).toEqual([])
  })

  it('reads the month and the columns in Turkish', async () => {
    await setLanguage('tr')
    const rendered = renderApp('/plan')
    await screen.findByRole('heading', { level: 1, name: 'Her liraya bir görev verin' })

    expect(await screen.findByText('Ekim 2026')).toBeInTheDocument()
    // The pool is named in the allocation legend, the group heading and its own row.
    expect(screen.getAllByText('Harcanabilir').length).toBeGreaterThan(0)
    expect(screen.getByText('Market')).toBeInTheDocument()
    rendered.unmount()
  })
})
