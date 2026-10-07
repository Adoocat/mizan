import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { newEmail, TEST_PASSWORD } from './support/accounts.ts'

/**
 * The credential flows, in a browser with no session (see the `auth` project in the config).
 */
test('a signed-out visitor is sent to sign-in and returned to where they were going', async ({
  page,
}) => {
  await page.goto('/plan')
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/plan')
})

test('sign up, sign out, sign back in', async ({ page }) => {
  const email = newEmail('flow')

  await page.goto('/sign-up')
  await page.getByLabel('Name').fill('Nadia Yılmaz')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { level: 1, name: /Good/ })).toBeVisible()
  await expect(page.getByText('Nadia Yılmaz')).toBeVisible()
  // Every account starts with its own personal workspace (decision D6).
  await expect(page.getByText('Personal', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()

  // The session cookie is really gone: a protected page bounces back to the form.
  await page.goto('/accounts')
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible()
})

test('a wrong password is refused with one vague message', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(newEmail('nobody'))
  await page.getByLabel('Password').fill('definitely-not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toHaveText(
    'That email and password do not match an account.',
  )
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
})

test('asking for a reset link says the same thing for any address', async ({ page }) => {
  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(newEmail('ghost'))
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('If that email has an account')
})

for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/reset-password']) {
  test(`${path} has no accessibility violations, including contrast`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      results.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5),
      })),
    ).toEqual([])
  })
}
