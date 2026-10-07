import type { MeResponse } from '@mizan/contracts'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { axeViolations, renderApp } from '../../test/render'
import { TEST_SESSION } from '../../test/session'

let session: MeResponse = TEST_SESSION
const profilePatches: unknown[] = []
const workspacePatches: unknown[] = []

const server = setupServer(
  http.get('*/api/v1/health', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
  http.get('*/api/v1/me', () => HttpResponse.json(session)),
  http.patch('*/api/v1/me', async ({ request }) => {
    const patch = (await request.json()) as Record<string, string>
    profilePatches.push(patch)
    session = { ...session, user: { ...session.user, ...patch } }
    return HttpResponse.json(session)
  }),
  http.patch('*/api/v1/workspace/settings', async ({ request }) => {
    const patch = (await request.json()) as Record<string, string | number>
    workspacePatches.push(patch)
    session = { ...session, workspace: { ...session.workspace, ...patch } }
    return HttpResponse.json(session)
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  session = TEST_SESSION
  profilePatches.length = 0
  workspacePatches.length = 0
})
afterAll(() => server.close())

describe('settings', () => {
  it('shows the signed-in profile and workspace', async () => {
    renderApp('/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })

    expect(await screen.findByDisplayValue('Elif Demir')).toBeInTheDocument()
    expect(screen.getByDisplayValue('elif@example.test')).toBeDisabled()
    expect(screen.getByLabelText('Base currency')).toHaveValue('TRY · ₺')
  })

  it('saves a new display name', async () => {
    renderApp('/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })

    const name = await screen.findByDisplayValue('Elif Demir')
    await userEvent.clear(name)
    await userEvent.type(name, 'Elif D.')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!)

    await waitFor(() => expect(profilePatches).toHaveLength(1))
    expect(profilePatches[0]).toEqual({ name: 'Elif D.', locale: 'en' })
  })

  it('sends the plan anchor as a number, not the select string', async () => {
    renderApp('/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })

    const anchor = await screen.findByLabelText('Plan month starts on day')
    await userEvent.selectOptions(anchor, '15')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[1]!)

    await waitFor(() => expect(workspacePatches).toHaveLength(1))
    expect(workspacePatches[0]).toEqual({ name: 'Personal', periodStartDay: 15 })
  })

  it('offers only anchors every month has', async () => {
    renderApp('/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })

    const anchor = await screen.findByLabelText('Plan month starts on day')
    const values = [...anchor.querySelectorAll('option')].map((option) => option.value)
    expect(values[0]).toBe('1')
    expect(values.at(-1)).toBe('28')
    expect(values).toHaveLength(28)
  })

  it('leaves the workspace read-only for a viewer', async () => {
    session = { ...TEST_SESSION, workspace: { ...TEST_SESSION.workspace, role: 'viewer' } }
    renderApp('/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })

    expect(await screen.findByLabelText('Workspace name')).toBeDisabled()
    expect(screen.getByLabelText('Plan month starts on day')).toBeDisabled()
    // One Save button left: the profile form's.
    expect(screen.getAllByRole('button', { name: 'Save changes' })).toHaveLength(1)
  })

  it('reports a rejected change without losing what was typed', async () => {
    server.use(
      http.patch('*/api/v1/me', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'Nothing to update' },
          { status: 400 },
        ),
      ),
    )
    renderApp('/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })

    const name = await screen.findByDisplayValue('Elif Demir')
    await userEvent.clear(name)
    await userEvent.type(name, 'Elif D.')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' })[0]!)

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing to update')
    expect(screen.getByDisplayValue('Elif D.')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderApp('/settings')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })
    await screen.findByDisplayValue('Elif Demir')
    expect(await axeViolations(container)).toEqual([])
  })
})
