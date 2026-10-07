import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { axeViolations, renderApp } from '../../test/render'
import { sessionHandlers, TEST_SESSION } from '../../test/session'

const signUps: unknown[] = []
const signIns: unknown[] = []

const server = setupServer(
  http.get('*/api/v1/health', () =>
    HttpResponse.json({ status: 'ok', checks: { database: 'ok' } }),
  ),
  ...sessionHandlers(null),
  http.post('*/api/v1/auth/sign-in/email', async ({ request }) => {
    const body = await request.json()
    signIns.push(body)
    return HttpResponse.json({ user: TEST_SESSION.user })
  }),
  http.post('*/api/v1/auth/sign-up/email', async ({ request }) => {
    signUps.push(await request.json())
    return HttpResponse.json({ user: TEST_SESSION.user })
  }),
  http.post('*/api/v1/auth/request-password-reset', () => HttpResponse.json({ status: true })),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  signUps.length = 0
  signIns.length = 0
})
afterAll(() => server.close())

describe('sign-in', () => {
  it('sends the credentials the user typed', async () => {
    renderApp('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' })

    await userEvent.type(screen.getByLabelText('Email'), 'Elif@Example.Test')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(signIns).toHaveLength(1))
    // The shared schema lowercases the address before it leaves the browser.
    expect(signIns[0]).toEqual({
      email: 'elif@example.test',
      password: 'correct-horse-battery',
    })
  })

  it('keeps an invalid email on the client', async () => {
    renderApp('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' })

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(signIns).toHaveLength(0)
  })

  it('shows one vague message for wrong credentials', async () => {
    server.use(
      http.post('*/api/v1/auth/sign-in/email', () =>
        HttpResponse.json(
          { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
          { status: 401 },
        ),
      ),
    )
    renderApp('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' })

    await userEvent.type(screen.getByLabelText('Email'), 'elif@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password-here')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That email and password do not match an account.')
  })

  it('names the wait after too many attempts', async () => {
    server.use(
      http.post('*/api/v1/auth/sign-in/email', () =>
        HttpResponse.json({ message: 'Too many requests' }, { status: 429 }),
      ),
    )
    renderApp('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' })

    await userEvent.type(screen.getByLabelText('Email'), 'elif@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderApp('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' })
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('sign-up', () => {
  it('rejects a short password before sending anything', async () => {
    renderApp('/sign-up')
    await screen.findByRole('heading', { level: 1, name: 'Start planning' })

    await userEvent.type(screen.getByLabelText('Name'), 'Elif')
    await userEvent.type(screen.getByLabelText('Email'), 'elif@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'tooshort')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument()
    expect(signUps).toHaveLength(0)
  })

  it('submits name, email and password', async () => {
    renderApp('/sign-up')
    await screen.findByRole('heading', { level: 1, name: 'Start planning' })

    await userEvent.type(screen.getByLabelText('Name'), 'Elif Demir')
    await userEvent.type(screen.getByLabelText('Email'), 'elif@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery-staple')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(signUps).toHaveLength(1))
    expect(signUps[0]).toEqual({
      name: 'Elif Demir',
      email: 'elif@example.test',
      password: 'correct-horse-battery-staple',
    })
  })

  it('explains a password found in a breach corpus', async () => {
    server.use(
      http.post('*/api/v1/auth/sign-up/email', () =>
        HttpResponse.json(
          { code: 'PASSWORD_COMPROMISED', message: 'compromised' },
          { status: 400 },
        ),
      ),
    )
    renderApp('/sign-up')
    await screen.findByRole('heading', { level: 1, name: 'Start planning' })

    await userEvent.type(screen.getByLabelText('Name'), 'Elif')
    await userEvent.type(screen.getByLabelText('Email'), 'elif@example.test')
    await userEvent.type(screen.getByLabelText('Password'), 'password123456')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('known data breach')
  })
})

describe('forgotten password', () => {
  it('gives the same answer whether or not the address has an account', async () => {
    renderApp('/forgot-password')
    await screen.findByRole('heading', { level: 1, name: 'Reset your password' })

    await userEvent.type(screen.getByLabelText('Email'), 'ghost@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'If that email has an account, a reset link is on its way.',
    )
  })
})

describe('resetting a password', () => {
  it('refuses a link with no token and offers a new one', async () => {
    renderApp('/reset-password')
    await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired')
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument()
  })

  it('refuses the stale-link error the API redirects with', async () => {
    renderApp('/reset-password?error=INVALID_TOKEN&token=abc')
    await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired')
  })

  it('catches a mistyped confirmation before sending it', async () => {
    renderApp('/reset-password?token=a-valid-looking-token')
    await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })

    await userEvent.type(screen.getByLabelText('New password'), 'a-brand-new-password')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-brand-new-passwOrd')
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))

    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument()
  })

  it('confirms once the new password is saved', async () => {
    server.use(http.post('*/api/v1/auth/reset-password', () => HttpResponse.json({ status: true })))
    renderApp('/reset-password?token=a-valid-looking-token')
    await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })

    await userEvent.type(screen.getByLabelText('New password'), 'a-brand-new-password')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'a-brand-new-password')
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Your password is set.')
  })
})

describe('the session gate', () => {
  it('sends a signed-out visitor to sign-in, remembering where they were going', async () => {
    const { router } = renderApp('/plan')
    await screen.findByRole('heading', { level: 1, name: 'Welcome back' })
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(router.state.location.search).toEqual({ redirect: '/plan' })
  })

  it('keeps a signed-in visitor out of the sign-in form', async () => {
    server.use(...sessionHandlers())
    const { router } = renderApp('/sign-in')
    await screen.findByRole('heading', { level: 1, name: /Good/ })
    expect(router.state.location.pathname).toBe('/')
  })
})
