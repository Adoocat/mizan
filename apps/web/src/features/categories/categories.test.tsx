import type { CategoryDto } from '@mizan/contracts'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { categoryHandlers, testCategory, TEST_CATEGORY_LIST } from '../../test/categories'
import { axeViolations, renderApp, setLanguage } from '../../test/render'
import { sessionHandlers, TEST_SESSION } from '../../test/session'

const creates: Record<string, unknown>[] = []
const patches: { id: string; body: Record<string, unknown> }[] = []
const merges: { id: string; body: Record<string, unknown> }[] = []
const archives: string[] = []

const server = setupServer(
  http.get('*/api/v1/health', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
  ...sessionHandlers(),
  ...categoryHandlers(),
  http.post('*/api/v1/categories', async ({ request }) => {
    creates.push((await request.json()) as Record<string, unknown>)
    return HttpResponse.json(testCategory('diningOut'), { status: 201 })
  }),
  http.patch('*/api/v1/categories/:id', async ({ request, params }) => {
    patches.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> })
    return HttpResponse.json(testCategory('diningOut'))
  }),
  http.post('*/api/v1/categories/:id/merge', async ({ request, params }) => {
    merges.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> })
    return HttpResponse.json({ into: testCategory('transport'), movedLines: 12 })
  }),
  http.post('*/api/v1/categories/:id/archive', ({ params }) => {
    archives.push(String(params.id))
    const archived: CategoryDto = {
      ...testCategory('transport'),
      archivedAt: '2026-10-22T08:00:00.000Z',
    }
    return HttpResponse.json(archived)
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(async () => {
  server.resetHandlers()
  creates.length = 0
  patches.length = 0
  merges.length = 0
  archives.length = 0
  await setLanguage('en')
})
afterAll(() => server.close())

async function openSettings() {
  const rendered = renderApp('/settings')
  await screen.findByRole('heading', { level: 1, name: 'Settings' })
  await screen.findByRole('region', { name: 'Essentials' })
  return rendered
}

describe('category settings', () => {
  it('groups the categories and says how many transactions use each', async () => {
    await openSettings()

    const essentials = screen.getByRole('region', { name: 'Essentials' })
    // A seeded category's name comes from i18next by its system key (ADR 0010).
    expect(within(essentials).getByText('Food & groceries')).toBeInTheDocument()
    expect(within(essentials).getByText('12 transactions')).toBeInTheDocument()

    // A category the user created has no key, so its stored name shows.
    const flexible = screen.getByRole('region', { name: 'Flexible spending' })
    expect(within(flexible).getByText('Öğrenci indirimi')).toBeInTheDocument()
  })

  it('labels every row action rather than showing a raw key', async () => {
    await openSettings()
    const row = screen.getByText('Transport').closest('li')!

    // `accounts.archive` is not a key that exists; it once rendered here verbatim.
    expect(within(row).getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(row.textContent).not.toMatch(/accounts\./)
  })

  it('adds a category to a group', async () => {
    await openSettings()
    const flexible = screen.getByRole('region', { name: 'Flexible spending' })

    await userEvent.click(
      within(flexible).getByRole('button', { name: 'Add to Flexible spending' }),
    )
    await userEvent.type(within(flexible).getByLabelText('New category'), 'Kahve')
    await userEvent.click(within(flexible).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(creates).toHaveLength(1))
    expect(creates[0]).toMatchObject({ name: 'Kahve', groupId: TEST_CATEGORY_LIST.groups[2]!.id })
  })

  it('renames a category and can move it to another group', async () => {
    await openSettings()
    const row = screen.getByText('Dining out').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Kahve & yemek')
    await userEvent.selectOptions(within(dialog).getByLabelText('Group'), 'Essentials')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]!.body).toMatchObject({
      name: 'Kahve & yemek',
      groupId: TEST_CATEGORY_LIST.groups[1]!.id,
    })
  })

  it('offers a merge only for a category that has transactions', async () => {
    await openSettings()

    const used = screen.getByText('Food & groceries').closest('li')!
    expect(within(used).getByRole('button', { name: 'Merge' })).toBeInTheDocument()

    const unused = screen.getByText('Transport').closest('li')!
    expect(within(unused).queryByRole('button', { name: 'Merge' })).not.toBeInTheDocument()
  })

  it('merges a duplicate into the category that keeps the history', async () => {
    await openSettings()
    const row = screen.getByText('Food & groceries').closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Merge' }))

    const dialog = await screen.findByRole('dialog')
    // The count makes the consequence explicit before the user commits to it.
    expect(dialog).toHaveTextContent('12 transactions move to the category you pick')

    await userEvent.selectOptions(within(dialog).getByLabelText('Merge into'), 'Transport')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Merge' }))

    await waitFor(() => expect(merges).toHaveLength(1))
    expect(merges[0]).toMatchObject({
      id: testCategory('groceries').id,
      body: { intoId: testCategory('transport').id },
    })
  })

  it('archives a category rather than deleting it', async () => {
    await openSettings()
    const row = screen.getByText('Transport').closest('li')!

    expect(within(row).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(archives).toEqual([testCategory('transport').id]))
  })

  it('translates the seeded names into Turkish', async () => {
    /*
     * The language comes from the profile here, not from `setLanguage`: the Settings page's
     * profile card syncs the UI to the signed-in user's `locale` when it mounts.
     */
    server.use(
      ...sessionHandlers({
        ...TEST_SESSION,
        user: { ...TEST_SESSION.user, locale: 'tr' },
      }),
    )
    renderApp('/settings')
    await screen.findByRole('region', { name: 'Zorunlu giderler' })

    expect(screen.getByText('Market')).toBeInTheDocument()
    expect(screen.getByText('Dışarıda yemek')).toBeInTheDocument()
    // A name the user chose is theirs in both languages.
    expect(screen.getByText('Öğrenci indirimi')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = await openSettings()
    expect(await axeViolations(container)).toEqual([])
  })
})
