import { expect, test } from '@playwright/test'

/**
 * Phase 4's Definition of Done, end to end: an account created with a 24,850 TL opening balance
 * shows exactly that, and reconciling against a statement works.
 *
 * Each test adds accounts to the shared signed-in workspace, so the assertions are scoped to the
 * account they create rather than to the whole list.
 */
const unique = () => Math.random().toString(36).slice(2, 8)

test('an account opened with 24,850 TL shows exactly that', async ({ page }) => {
  const name = `Garanti ${unique()}`

  await page.goto('/accounts')
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible()

  await page.getByRole('button', { name: 'Add account' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account name').fill(name)
  await dialog.getByLabel('Type').selectOption({ label: 'Current account' })
  await dialog.getByLabel('Bank or last four digits').fill('··4471')
  await dialog.getByLabel('Balance today').fill('24850')
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('link', { name: new RegExp(name) })
  await expect(row).toContainText('₺24,850.00')

  // The detail view derives the same figure from the account's lines.
  await row.click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Balance' })).toContainText('₺24,850.00')
  await expect(page.getByRole('region', { name: 'Recent activity' })).toContainText(
    'Opening balance',
  )
})

test('reconciling records the one adjustment that closes the gap', async ({ page }) => {
  const name = `Reconcile ${unique()}`

  await page.goto('/accounts')
  await page.getByRole('button', { name: 'Add account' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Account name').fill(name)
  await form.getByLabel('Balance today').fill('1000')
  await form.getByRole('button', { name: 'Add account' }).click()
  await expect(form).toBeHidden()

  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page.getByRole('region', { name: 'Balance' })).toContainText('₺1,000.00')

  await page.getByRole('button', { name: 'Reconcile' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Balance on your statement').fill('1250,75')
  // Previewed with the same calculation the API performs.
  await expect(dialog).toContainText('+₺250.75')
  await dialog.getByRole('button', { name: 'Reconcile' }).click()

  await expect(dialog).toBeHidden()
  await expect(page.getByRole('region', { name: 'Balance' })).toContainText('₺1,250.75')
  await expect(page.getByRole('region', { name: 'Recent activity' })).toContainText(
    'Reconciliation adjustment',
  )

  // Reconciling again to the same figure finds nothing to change.
  await page.getByRole('button', { name: 'Reconcile' }).click()
  await dialog.getByLabel('Balance on your statement').fill('1250,75')
  await expect(dialog).toContainText('Nothing to adjust')
})

test('a credit card holds a negative balance and lands in its own group', async ({ page }) => {
  const name = `Bonus ${unique()}`

  await page.goto('/accounts')
  await page.getByRole('button', { name: 'Add account' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account name').fill(name)
  await dialog.getByLabel('Type').selectOption({ label: 'Credit card' })
  await dialog.getByLabel('Balance today').fill('-4860')
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toBeHidden()

  const cards = page.getByRole('region', { name: 'Credit cards' })
  await expect(cards.getByRole('link', { name: new RegExp(name) })).toContainText('−₺4,860.00')
})

test('an archived account leaves the list and keeps its history', async ({ page }) => {
  const name = `Closed ${unique()}`

  await page.goto('/accounts')
  await page.getByRole('button', { name: 'Add account' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Account name').fill(name)
  await form.getByLabel('Balance today').fill('500')
  await form.getByRole('button', { name: 'Add account' }).click()
  await expect(form).toBeHidden()

  await page.getByRole('link', { name: new RegExp(name) }).click()
  await page.getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText('Archived')).toBeVisible()

  await page.goto('/accounts')
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0)

  await page.getByRole('button', { name: 'Show archived' }).click()
  const archived = page.getByRole('link', { name: new RegExp(name) })
  await expect(archived).toBeVisible()
  await expect(archived).toContainText('₺500.00')
})
