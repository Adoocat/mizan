import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { accountHandlers } from '../../test/accounts'
import { categoryHandlers, testCategory } from '../../test/categories'
import { goalHandlers } from '../../test/goals'
import { recurringHandlers, TEST_RULES, TEST_UPCOMING } from '../../test/recurring'
import { axeViolations, renderApp, setLanguage } from '../../test/render'
import { sessionHandlers } from '../../test/session'

const creates: unknown[] = []
const patches: { id: string; body: unknown }[] = []
const confirms: { id: string; date: string; body: unknown }[] = []
const skips: { id: string; date: string }[] = []
const pauses: string[] = []

const OCCURRENCE_RESPONSE = {
  rule: TEST_RULES[0],
  occurrence: { ...TEST_UPCOMING.occurrences[0], state: 'skipped' },
}

const server = setupServer(
  http.get('*/api/v1/health', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
  ...sessionHandlers(),
  ...accountHandlers(),
  ...categoryHandlers(),
  ...goalHandlers(),
  ...recurringHandlers(),
  http.post('*/api/v1/recurring', async ({ request }) => {
    creates.push(await request.json())
    return HttpResponse.json(TEST_RULES[0], { status: 201 })
  }),
  http.patch('*/api/v1/recurring/:id', async ({ request, params }) => {
    patches.push({ id: String(params.id), body: await request.json() })
    return HttpResponse.json(TEST_RULES[0])
  }),
  http.post('*/api/v1/recurring/:id/occurrences/:date/confirm', async ({ request, params }) => {
    confirms.push({
      id: String(params.id),
      date: String(params.date),
      body: await request.json(),
    })
    return HttpResponse.json({
      ...OCCURRENCE_RESPONSE,
      occurrence: { ...TEST_UPCOMING.occurrences[0], state: 'posted' },
      transactionId: '019a2c1e-0000-7000-8000-00000009f001',
      alreadyPosted: false,
    })
  }),
  http.post('*/api/v1/recurring/:id/occurrences/:date/skip', ({ params }) => {
    skips.push({ id: String(params.id), date: String(params.date) })
    return HttpResponse.json(OCCURRENCE_RESPONSE)
  }),
  http.post('*/api/v1/recurring/:id/pause', ({ params }) => {
    pauses.push(String(params.id))
    return HttpResponse.json({ ...TEST_RULES[0], status: 'paused' })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  creates.length = 0
  patches.length = 0
  confirms.length = 0
  skips.length = 0
  pauses.length = 0
  await setLanguage('en')
})
afterAll(() => server.close())

async function openUpcoming() {
  const rendered = renderApp('/calendar')
  await screen.findByRole('heading', { level: 1, name: 'Upcoming' })
  // Both queries have to land before anything can be asserted: the page renders its panels from
  // the occurrences and the rules, and the same payee appears in each.
  await screen.findByRole('region', { name: 'Schedule' })
  await screen.findByRole('region', { name: 'Recurring each month' })
  return rendered
}

/** The panel a row belongs to, so "Confirm" on an overdue row is told apart from the schedule. */
function panel(name: string | RegExp) {
  return screen.getByRole('region', { name })
}

/** One row of a panel, found by the rule it is for. */
function row(panelName: string, ruleName: string) {
  return within(panel(panelName)).getByText(ruleName).closest('li')!
}

describe('the upcoming page', () => {
  it('shows what is due, what was missed, and what it costs a month', async () => {
    await openUpcoming()

    // The seven-day total: 549 + 720, with the salary counted as income rather than a bill.
    expect(screen.getByText('₺1,269')).toBeInTheDocument()
    expect(screen.getByText('+₺46,000')).toBeInTheDocument()

    expect(screen.getByText('Next 7 days')).toBeInTheDocument()
    expect(screen.getByText('2 payments')).toBeInTheDocument()
    expect(screen.getByText('1 payment not recorded')).toBeInTheDocument()
    // The committed figure is on its tile and again on the panel it describes.
    expect(screen.getAllByText('₺47,269')).toHaveLength(2)
  })

  it('separates the overdue payment from the ones still to come', async () => {
    await openUpcoming()

    const overdue = panel('Overdue')
    expect(within(overdue).getByText('İSKİ Water')).toBeInTheDocument()
    expect(within(overdue).getByText(/Overdue 3 days/)).toBeInTheDocument()

    const schedule = panel('Schedule')
    expect(within(schedule).getByText('Turkcell Superonline')).toBeInTheDocument()
    expect(within(schedule).queryByText('İSKİ Water')).not.toBeInTheDocument()
  })

  it('marks an estimated amount with a tilde', async () => {
    await openUpcoming()
    const schedule = panel('Schedule')
    expect(within(schedule).getByText(/~/)).toBeInTheDocument()
    expect(within(schedule).getAllByText(/estimated/).length).toBeGreaterThan(0)
  })

  it('says what checking will hold once everything has happened', async () => {
    await openUpcoming()
    expect(screen.getByText(/₺69,271/)).toBeInTheDocument()
  })

  it('switches to the 30-day window', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    let askedDays: string | null = null
    server.use(
      http.get('*/api/v1/upcoming', ({ request }) => {
        askedDays = new URL(request.url).searchParams.get('days')
        return HttpResponse.json(TEST_UPCOMING)
      }),
    )

    await user.click(screen.getByRole('radio', { name: '30 days' }))
    await waitFor(() => expect(askedDays).toBe('30'))
  })

  it('lists the rules with their monthly cost and their state', async () => {
    await openUpcoming()

    const rules = panel('Recurring each month')
    expect(within(rules).getByText('MACFit membership')).toBeInTheDocument()
    expect(within(rules).getByText('Paused')).toBeInTheDocument()
    expect(within(rules).getByText('Posts itself')).toBeInTheDocument()
    expect(within(rules).getAllByText(/Every month/).length).toBe(TEST_RULES.length)
  })

  it('says plainly when there is nothing due', async () => {
    server.use(
      http.get('*/api/v1/upcoming', () =>
        HttpResponse.json({
          ...TEST_UPCOMING,
          overdue: [],
          occurrences: [],
          nextIncome: null,
          overdueTotal: { amount: '0.00', currency: 'TRY' },
          dueTotal: { amount: '0.00', currency: 'TRY' },
          incomeTotal: { amount: '0.00', currency: 'TRY' },
        }),
      ),
    )
    await openUpcoming()
    expect(await screen.findByText('Nothing due')).toBeInTheDocument()
    expect(screen.getByText('No recurring payment falls in the next 7 days.')).toBeInTheDocument()
  })

  it('offers to add the first rule when there are none', async () => {
    server.use(
      http.get('*/api/v1/recurring', () =>
        HttpResponse.json({ rules: [], committedMonthly: { amount: '0.00', currency: 'TRY' } }),
      ),
    )
    await openUpcoming()
    expect(await screen.findByText('No recurring payments yet')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = await openUpcoming()
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('acting on one occurrence', () => {
  it('confirms it with the amount that actually moved', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    const scheduled = row('Schedule', 'Turkcell Superonline')
    await user.click(within(scheduled).getByRole('button', { name: 'Confirm' }))

    const amount = await screen.findByLabelText('Amount that moved')
    expect(amount).toHaveValue('549.00')

    await user.clear(amount)
    await user.type(amount, '612.40')
    await user.click(screen.getByRole('button', { name: 'Record it' }))

    await waitFor(() => expect(confirms).toHaveLength(1))
    // The occurrence is addressed by its series date; the amount is what the user typed.
    expect(confirms[0]?.date).toBe('2026-10-23')
    expect(confirms[0]?.body).toMatchObject({ amount: { amount: '612.40', currency: 'TRY' } })
    // A client-supplied id, so a retry cannot pay the bill twice.
    expect(confirms[0]?.body).toHaveProperty('transactionId')
  })

  it('skips it in one tap, by its series date', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    const scheduled = row('Schedule', 'Turkcell Superonline')
    await user.click(within(scheduled).getByRole('button', { name: 'Skip' }))

    await waitFor(() => expect(skips).toHaveLength(1))
    expect(skips[0]?.date).toBe('2026-10-23')
  })

  it('confirms an overdue payment from its own panel', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    const missed = row('Overdue', 'İSKİ Water')
    await user.click(within(missed).getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByLabelText('Amount that moved')).toHaveValue('310.00')
    await user.click(screen.getByRole('button', { name: 'Record it' }))
    await waitFor(() => expect(confirms).toHaveLength(1))
    expect(confirms[0]?.date).toBe('2026-10-19')
  })
})

describe('the rule editor', () => {
  it('creates a monthly payment', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    await user.click(screen.getByRole('button', { name: 'Add recurring' }))
    await user.type(await screen.findByLabelText('Name'), 'Netflix')
    await user.type(screen.getByLabelText('Amount'), '222')

    const picker = screen.getByRole('combobox', { name: 'Category' })
    await user.click(picker)
    await user.type(picker, 'dining')
    await user.click(await screen.findByRole('option', { name: /Dining out/ }))

    await user.click(screen.getByRole('button', { name: 'Add rule' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toMatchObject({
      kind: 'expense',
      name: 'Netflix',
      amount: { amount: '222.00', currency: 'TRY' },
      categoryId: testCategory('diningOut').id,
      freq: 'monthly',
      interval: 1,
      amountMode: 'fixed',
      autoPost: false,
    })
  })

  it('will not save an on-budget payment with no category', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    await user.click(screen.getByRole('button', { name: 'Add recurring' }))
    await user.type(await screen.findByLabelText('Name'), 'Netflix')
    await user.type(screen.getByLabelText('Amount'), '222')

    // The plan has to be able to see where this money goes (§10), so the rule is not writable
    // until it can — a month before the Confirm button would have had to refuse it.
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeDisabled()
  })

  it('shows what the rule costs in an average month while it is being typed', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    await user.click(screen.getByRole('button', { name: 'Add recurring' }))
    await user.click(await screen.findByRole('radio', { name: 'Payment' }))
    await user.type(screen.getByLabelText('Amount'), '6000')
    await user.selectOptions(screen.getByLabelText('How often'), 'yearly')

    // ₺6,000 a year is ₺500 a month, from the same function the API runs.
    expect(await screen.findByText(/₺500/)).toBeInTheDocument()
  })

  it('asks for a destination account on a transfer, and nothing else', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    await user.click(screen.getByRole('button', { name: 'Add recurring' }))
    await user.click(await screen.findByRole('radio', { name: 'Transfer' }))

    expect(screen.getByLabelText('Moved to')).toBeInTheDocument()
    // A transfer between your own accounts has no category: the money has not been spent.
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument()
  })

  it('will not let an estimated amount post itself', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    await user.click(screen.getByRole('button', { name: 'Add recurring' }))
    await user.click(await screen.findByRole('radio', { name: 'Fixed amount' }))
    expect(screen.getByLabelText('Record this automatically when it comes due')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Estimated' }))
    expect(
      screen.queryByLabelText('Record this automatically when it comes due'),
    ).not.toBeInTheDocument()
  })

  it('offers the whole series or this month onwards when editing', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    const ruleRow = row('Recurring each month', 'Turkcell Superonline')
    await user.click(within(ruleRow).getByRole('button', { name: 'Edit' }))

    await user.click(await screen.findByRole('radio', { name: 'This month onwards' }))
    const amount = screen.getByLabelText('Amount')
    await user.clear(amount)
    await user.type(amount, '599')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]?.body).toMatchObject({
      scope: 'future',
      from: '2026-10-22',
      amount: { amount: '599.00', currency: 'TRY' },
    })
  })

  it('pauses a rule from its row', async () => {
    const user = userEvent.setup()
    await openUpcoming()

    const ruleRow = row('Recurring each month', 'Turkcell Superonline')
    await user.click(within(ruleRow).getByRole('button', { name: 'Pause' }))

    await waitFor(() => expect(pauses).toEqual([TEST_RULES[0]!.id]))
  })
})

describe('the Turkish translation', () => {
  it('reads the page in Turkish', async () => {
    await setLanguage('tr')
    renderApp('/calendar')

    expect(await screen.findByText('Yinelenen ve planlanmış para hareketleri')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yinelenen ekle' })).toBeInTheDocument()
    expect(await screen.findByText('Gecikmiş')).toBeInTheDocument()
    expect(await screen.findByText(/3 gün gecikti/)).toBeInTheDocument()
  })
})
