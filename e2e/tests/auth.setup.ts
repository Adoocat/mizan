import { expect, test as setup } from '@playwright/test'
import { newEmail, STORAGE_STATE, TEST_PASSWORD } from './support/accounts.ts'

/**
 * Signs one user up through the real form and saves the session cookie for every other spec
 * (Playwright's standard auth pattern). One sign-up per run also keeps the suite under the API's
 * per-IP sign-up limit; the credential flows themselves are covered in `auth.spec.ts`, which runs
 * in a signed-out context.
 */
setup('sign up and save the session', async ({ page }) => {
  await page.goto('/sign-up')
  await expect(page.getByRole('heading', { level: 1, name: 'Start planning' })).toBeVisible()

  await page.getByLabel('Name').fill('Elif Demir')
  await page.getByLabel('Email').fill(newEmail('setup'))
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Landing on the dashboard means the session cookie is set and `/me` answered.
  await expect(page.getByRole('heading', { level: 1, name: /Good/ })).toBeVisible()

  await page.context().storageState({ path: STORAGE_STATE })
})
