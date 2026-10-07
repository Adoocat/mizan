import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { axeViolations, renderApp, setLanguage } from '../../test/render'
import { accountHandlers } from '../../test/accounts'
import { sessionHandlers } from '../../test/session'

const server = setupServer(
  http.get('*/api/v1/health', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
  // Every page inside the shell renders behind the session gate.
  ...sessionHandlers(),
  // Accounts is wired to the API as of phase 4.
  ...accountHandlers(),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  localStorage.clear()
  delete document.documentElement.dataset.theme
  await setLanguage('en')
})
afterAll(() => server.close())

const sideNav = async () =>
  (await screen.findAllByRole('navigation', { name: 'Main navigation' }))[0]!

describe('AppShell', () => {
  it('shows every screen in the sidebar, in the four groups of the mockup', async () => {
    renderApp('/')
    const nav = await sideNav()
    expect(await within(nav).findByRole('link', { name: 'Home' })).toBeInTheDocument()
    for (const name of [
      'Plan',
      'Transactions',
      'Calendar',
      'Savings',
      'Investments',
      'Goals',
      'Debts',
      'Net worth',
      'Reports',
      'Accounts',
      'What-if simulator',
    ]) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('marks the current page and navigates', async () => {
    renderApp('/plan')
    const nav = await sideNav()
    expect(await within(nav).findByRole('link', { name: 'Plan' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    await userEvent.click(within(nav).getByRole('link', { name: 'Goals' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Goals' })).toBeInTheDocument()
  })

  it('switches theme and remembers it', async () => {
    renderApp('/settings')
    const themes = (await screen.findAllByRole('radiogroup', { name: 'Theme' }))[0]!
    await userEvent.click(within(themes).getByRole('radio', { name: 'Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('mizan.theme')).toBe('light')
    await userEvent.click(within(themes).getByRole('radio', { name: 'System' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('switches language to Turkish and back', async () => {
    renderApp('/')
    const languages = (await screen.findAllByRole('radiogroup', { name: 'Language' }))[0]!
    await userEvent.click(within(languages).getByRole('radio', { name: 'Türkçe' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'İyi günler Elif' }),
    ).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('tr')
    expect(localStorage.getItem('mizan.language')).toBe('tr')
    const tr = (await screen.findAllByRole('radiogroup', { name: 'Dil' }))[0]!
    await userEvent.click(within(tr).getByRole('radio', { name: 'English' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Good afternoon, Elif' }),
    ).toBeInTheDocument()
  })

  it('opens the mobile More sheet with the remaining pages', async () => {
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'More' }))
    const sheet = await screen.findByRole('dialog', { name: 'More' })
    for (const name of ['Transactions', 'Calendar', 'Reports', 'Accounts', 'Settings']) {
      expect(within(sheet).getByRole('link', { name })).toBeInTheDocument()
    }
    await act(async () => {
      await userEvent.click(within(sheet).getByRole('link', { name: 'Accounts' }))
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a not-found page for unknown paths', async () => {
    renderApp('/nope')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it.each([
    '/',
    '/plan',
    '/transactions',
    '/calendar',
    '/savings',
    '/investments',
    '/goals',
    '/debts',
    '/net-worth',
    '/reports',
    '/accounts',
    '/what-if',
    '/settings',
    '/showcase',
  ])('%s has no accessibility violations', async (path) => {
    const { container } = renderApp(path)
    await screen.findByRole('heading', { level: 1 })
    expect(await axeViolations(container)).toEqual([])
  })
})
