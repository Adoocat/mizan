import type { GoalListResponse } from '@mizan/contracts'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { accountHandlers } from '../../test/accounts'
import { goalHandlers, TEST_GOAL_LIST, TEST_GOALS, TEST_GOAL_RESPONSE } from '../../test/goals'
import { axeViolations, renderApp, setLanguage } from '../../test/render'
import { sessionHandlers } from '../../test/session'

const creates: unknown[] = []
const contributions: { id: string; body: unknown }[] = []
const planLines: { id: string; body: unknown }[] = []
const archives: string[] = []

const server = setupServer(
  http.get('*/api/v1/health', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
  ...sessionHandlers(),
  ...accountHandlers(),
  ...goalHandlers(),
  http.post('*/api/v1/goals', async ({ request }) => {
    creates.push(await request.json())
    return HttpResponse.json(TEST_GOALS[1], { status: 201 })
  }),
  http.post('*/api/v1/goals/:id/contributions', async ({ request, params }) => {
    contributions.push({ id: String(params.id), body: await request.json() })
    return HttpResponse.json(TEST_GOAL_RESPONSE)
  }),
  http.post('*/api/v1/goals/:id/plan-line', async ({ request, params }) => {
    planLines.push({ id: String(params.id), body: await request.json() })
    return HttpResponse.json(TEST_GOAL_RESPONSE)
  }),
  http.post('*/api/v1/goals/:id/archive', ({ params }) => {
    archives.push(String(params.id))
    return HttpResponse.json({ ...TEST_GOALS[1], archivedAt: '2026-10-22T08:58:00.000Z' })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  creates.length = 0
  contributions.length = 0
  planLines.length = 0
  archives.length = 0
  await setLanguage('en')
})
afterAll(() => server.close())

async function openGoals() {
  renderApp('/goals')
  await screen.findByRole('heading', { level: 1, name: 'Goals' })
}

describe('the goals list', () => {
  it('shows all three kinds of goal with what each one holds', async () => {
    await openGoals()

    expect(await screen.findByText('Emergency fund', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getByText('Japan trip')).toBeInTheDocument()
    expect(screen.getByText('Kasko insurance')).toBeInTheDocument()

    // Each type is labelled, so a sinking fund is not mistaken for a savings goal.
    expect(screen.getByText('Savings goal')).toBeInTheDocument()
    expect(screen.getByText('Sinking fund')).toBeInTheDocument()

    expect(screen.getByText('₺24,500')).toBeInTheDocument()
    expect(screen.getByText('₺109,500')).toBeInTheDocument()
  })

  it('shows the emergency fund in months of cover, not as a monthly amount', async () => {
    await openGoals()
    expect(await screen.findByText('3.3 months of essential expenses covered')).toBeInTheDocument()
    expect(screen.getByText('Funded')).toBeInTheDocument()
  })

  it('shows what a dated goal needs each month, and flags one that is behind', async () => {
    await openGoals()
    expect(await screen.findByText('Behind')).toBeInTheDocument()
    // ₺1,167 a month by 15 Jul 2027, as the API computed it.
    expect(screen.getByText(/₺1,167/)).toBeInTheDocument()
    expect(screen.getByText(/15 Jul 2027/)).toBeInTheDocument()
  })

  it('says plainly when a goal has no date to work towards', async () => {
    server.use(
      http.get('*/api/v1/goals', () =>
        HttpResponse.json({
          ...TEST_GOAL_LIST,
          goals: [
            {
              ...TEST_GOALS[1],
              targetDate: null,
              monthsLeft: null,
              requiredMonthly: null,
              plannedMonthly: null,
              planLineId: null,
              projectedFinish: null,
              status: 'neutral',
            },
          ],
        }),
      ),
    )
    await openGoals()
    expect(
      await screen.findByText('No target date, so no monthly amount to aim for'),
    ).toBeInTheDocument()
  })

  it('projects a finish month for a dateless goal that has a plan line', async () => {
    server.use(
      http.get('*/api/v1/goals', () =>
        HttpResponse.json({
          ...TEST_GOAL_LIST,
          goals: [
            {
              ...TEST_GOALS[1],
              targetDate: null,
              monthsLeft: null,
              requiredMonthly: null,
              projectedFinish: '2029-08-01',
              status: 'neutral',
            },
          ],
        }),
      ),
    )
    await openGoals()
    // A month, not a day: the projection is only ever accurate to the month.
    expect(await screen.findByText('On course to finish in Aug 2029')).toBeInTheDocument()
  })

  it('invites the first goal when there are none', async () => {
    server.use(
      http.get('*/api/v1/goals', () =>
        HttpResponse.json({
          ...TEST_GOAL_LIST,
          goals: [],
          totalSaved: { amount: '0.00', currency: 'TRY' },
        }),
      ),
    )
    await openGoals()
    expect(await screen.findByText('No goals yet')).toBeInTheDocument()
  })

  it('reports a failure to load instead of showing an empty list', async () => {
    server.use(
      http.get('*/api/v1/goals', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Internal Server Error', status: 500 },
          { status: 500 },
        ),
      ),
    )
    await openGoals()
    expect(await screen.findByRole('alert')).toHaveTextContent('Your goals could not be loaded.')
  })

  it('asks the API for archived goals only when told to', async () => {
    const searches: string[] = []
    server.use(
      http.get('*/api/v1/goals', ({ request }) => {
        searches.push(new URL(request.url).search)
        return HttpResponse.json(TEST_GOAL_LIST)
      }),
    )
    await openGoals()
    await waitFor(() => expect(searches).toContain('?includeArchived=false'))

    await userEvent.click(screen.getByRole('button', { name: 'Show archived' }))
    await waitFor(() => expect(searches).toContain('?includeArchived=true'))
  })

  it('warns when an account has more earmarked than it holds, without refusing anything', async () => {
    server.use(
      http.get('*/api/v1/goals', () =>
        HttpResponse.json({
          ...TEST_GOAL_LIST,
          overEarmarked: [
            {
              accountId: '019a2c1e-0000-7000-8000-0000000000a2',
              balance: { amount: '650000.00', currency: 'TRY' },
              earmarked: { amount: '670000.00', currency: 'TRY' },
              excess: { amount: '20000.00', currency: 'TRY' },
            },
          ],
        }),
      ),
    )
    await openGoals()
    expect(await screen.findByText('More is earmarked than is there')).toBeInTheDocument()
    expect(screen.getByText(/more is earmarked than House deposit holds/)).toBeInTheDocument()
  })
})

describe('contributing', () => {
  it('earmarks money and previews what the goal would hold', async () => {
    await openGoals()
    await screen.findByText('Japan trip')

    await userEvent.click(screen.getAllByRole('button', { name: 'Contribute' })[1]!)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Contribute to Japan trip')

    await userEvent.type(screen.getByLabelText('Amount to earmark'), '2500')
    // The preview runs the same domain function the API will: ₺24,500 + ₺2,500.
    expect(await screen.findByText(/₺27,000/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Earmark money' }))
    await waitFor(() => expect(contributions).toHaveLength(1))
    expect(contributions[0]!.id).toBe(TEST_GOALS[1]!.id)
    expect(contributions[0]!.body).toMatchObject({
      amount: { amount: '2500.00', currency: 'TRY' },
    })
  })

  it('sends a release as a negative amount', async () => {
    await openGoals()
    await screen.findByText('Japan trip')

    await userEvent.click(screen.getAllByRole('button', { name: 'Contribute' })[1]!)
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('radio', { name: 'Release' }))
    await userEvent.type(screen.getByLabelText('Amount to release'), '2000')
    await userEvent.click(screen.getByRole('button', { name: 'Release money' }))

    await waitFor(() => expect(contributions).toHaveLength(1))
    expect(contributions[0]!.body).toMatchObject({
      amount: { amount: '-2000.00', currency: 'TRY' },
    })
  })

  it('refuses to release more than the goal holds, before sending anything', async () => {
    await openGoals()
    await screen.findByText('Japan trip')

    await userEvent.click(screen.getAllByRole('button', { name: 'Contribute' })[1]!)
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('radio', { name: 'Release' }))
    await userEvent.type(screen.getByLabelText('Amount to release'), '30000')

    expect(await screen.findByText('That is more than this goal holds.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Release money' })).toBeDisabled()
    expect(contributions).toHaveLength(0)
  })
})

describe('putting a goal in the plan', () => {
  it('adds the goal at what it needs each month', async () => {
    await openGoals()
    await screen.findByText('Kasko insurance')

    // Only the goals without a line offer it; Japan trip already has one.
    const buttons = screen.getAllByRole('button', { name: 'Add to plan' })
    expect(buttons).toHaveLength(1)

    await userEvent.click(buttons[0]!)
    await waitFor(() => expect(planLines).toHaveLength(1))
    expect(planLines[0]!.id).toBe(TEST_GOALS[2]!.id)
  })

  it('shows what the plan already gives a goal instead of offering to add it', async () => {
    await openGoals()
    expect(await screen.findByText(/In this month’s plan:/)).toBeInTheDocument()
    expect(screen.getByText('₺1,000')).toBeInTheDocument()
  })
})

describe('creating a goal', () => {
  it('asks for months of cover for an emergency fund, and never a target', async () => {
    await openGoals()
    await userEvent.click(screen.getByRole('button', { name: 'New goal' }))
    await screen.findByRole('dialog')

    await userEvent.selectOptions(screen.getByLabelText('Kind of goal'), 'emergency_fund')

    expect(screen.getByLabelText('Months of cover')).toBeInTheDocument()
    // Its target comes from the plan, so there is no target field to fill in.
    expect(screen.queryByLabelText('Target')).not.toBeInTheDocument()
    expect(screen.getByText(/of essentials and debt a month/)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Name'), 'Emergency fund')
    await userEvent.click(screen.getByRole('button', { name: 'Create goal' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toMatchObject({
      type: 'emergency_fund',
      name: 'Emergency fund',
      emergencyMonths: 3,
    })
    expect(creates[0]).not.toHaveProperty('target')
  })

  it('requires a due date for a sinking fund', async () => {
    await openGoals()
    await userEvent.click(screen.getByRole('button', { name: 'New goal' }))
    await screen.findByRole('dialog')

    await userEvent.selectOptions(screen.getByLabelText('Kind of goal'), 'sinking_fund')
    expect(screen.getByLabelText('Due date')).toBeInTheDocument()
    expect(screen.getByLabelText('Comes round again')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Name'), 'Kasko insurance')
    await userEvent.type(screen.getByLabelText('Target'), '15000')
    // No date yet: nothing is sent, because a bill without a date is not a sinking fund.
    await userEvent.click(screen.getByRole('button', { name: 'Create goal' }))
    expect(creates).toHaveLength(0)

    await userEvent.type(screen.getByLabelText('Due date'), '2027-02-10')
    await userEvent.click(screen.getByRole('button', { name: 'Create goal' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toMatchObject({
      type: 'sinking_fund',
      targetDate: '2027-02-10',
      // The currency input normalizes to the currency's minor units before it leaves the form.
      target: { amount: '15000.00', currency: 'TRY' },
    })
  })

  it('sends an idempotency id, so a double tap cannot create two goals', async () => {
    await openGoals()
    await userEvent.click(screen.getByRole('button', { name: 'New goal' }))
    await screen.findByRole('dialog')

    await userEvent.type(screen.getByLabelText('Name'), 'New computer')
    await userEvent.type(screen.getByLabelText('Target'), '40000')
    await userEvent.click(screen.getByRole('button', { name: 'Create goal' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toHaveProperty('id')
  })
})

describe('archiving', () => {
  it('archives a goal, keeping its history', async () => {
    await openGoals()
    await screen.findByText('Japan trip')

    await userEvent.click(screen.getAllByRole('button', { name: 'Archive' })[1]!)
    await waitFor(() => expect(archives).toHaveLength(1))
    expect(archives[0]).toBe(TEST_GOALS[1]!.id)
  })

  it('offers an archived goal back instead of letting it be contributed to', async () => {
    const archived: GoalListResponse = {
      ...TEST_GOAL_LIST,
      goals: [{ ...TEST_GOALS[1]!, archivedAt: '2026-10-01T00:00:00.000Z' }],
    }
    server.use(http.get('*/api/v1/goals', () => HttpResponse.json(archived)))

    await openGoals()
    expect(await screen.findByText('Archived')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bring back' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contribute' })).not.toBeInTheDocument()
  })
})

describe('the page in Turkish', () => {
  it('translates every label it shows', async () => {
    await setLanguage('tr')
    renderApp('/goals')

    await screen.findByRole('heading', { level: 1, name: 'Hedefler' })
    // The names come from the API, so they are the user's own words in either language; the
    // type labels, the buttons and the derived notes are what gets translated.
    expect(await screen.findByText('Emergency fund', { selector: 'h3' })).toBeInTheDocument()
    expect(screen.getByText('Acil durum fonu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yeni hedef' })).toBeInTheDocument()
    expect(screen.getByText('Birikim fonu')).toBeInTheDocument()
    expect(screen.getByText('3,3 aylık zorunlu gider karşılanıyor')).toBeInTheDocument()
  })
})

describe('accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = renderApp('/goals')
    await screen.findByText('Japan trip')
    expect(await axeViolations(container)).toEqual([])
  })
})
