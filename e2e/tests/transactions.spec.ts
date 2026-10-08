import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Phase 5's Definition of Done, end to end: the 1,600 TL supermarket split saves correctly and
 * the balance follows (PLAN §20).
 *
 * The specs share one signed-in workspace, and both browser projects run against it, so every
 * test gives its account *and* its payee a unique suffix and asserts only on its own rows.
 */
const unique = () => Math.random().toString(36).slice(2, 8)

async function addAccount(page: Page, name: string, balance: string) {
  await page.goto('/accounts')
  await page.getByRole('button', { name: 'Add account' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account name').fill(name)
  await dialog.getByLabel('Balance today').fill(balance)
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toBeHidden()
  // Wait for the list to show it, so quick add's account picker is working from fresh data.
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
}

/** Quick add, from the app shell: the header button on a desktop, the + tab on a phone. */
async function openQuickAdd(page: Page) {
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  return page.getByRole('dialog')
}

/**
 * Picks a category in the combo box by typing and choosing from its own listbox. The listbox has
 * to be addressed through the combo box: a native `<select>`'s children are options too, and the
 * form has one for the account.
 */
async function pickCategory(dialog: Locator, index: number, query: string) {
  const field = dialog.getByRole('combobox', { name: 'Category' }).nth(index)
  await field.click()
  await field.fill(query)
  await dialog
    .getByRole('listbox', { name: 'Category' })
    .getByRole('option', { name: new RegExp(query, 'i') })
    .first()
    .click()
}

test('the 1,600 TL supermarket split saves and moves the balance', async ({ page }) => {
  const name = `Split ${unique()}`
  const payee = `Migros Kadıköy ${name}`
  await addAccount(page, name, '30000')

  const dialog = await openQuickAdd(page)
  await dialog.getByLabel('Amount').first().fill('1200')
  await pickCategory(dialog, 0, 'groceries')
  await dialog.getByLabel('Payee').fill(payee)
  await dialog.getByLabel('Account').selectOption({ label: name })

  // Split the rest across two more categories: 1,200 + 300 + 100 = 1,600.
  await dialog.getByRole('button', { name: 'Split this' }).click()
  await dialog.getByLabel('Amount').nth(1).fill('300')
  await pickCategory(dialog, 1, 'personal')

  await dialog.getByRole('button', { name: 'Split this' }).click()
  await dialog.getByLabel('Amount').nth(2).fill('100')
  await pickCategory(dialog, 2, 'other')

  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/transactions')
  const row = page.getByRole('listitem').filter({ hasText: payee })
  await expect(row).toContainText('−₺1,600.00')
  await expect(row).toContainText('Split')

  // The parts are the three that were entered.
  await row.getByRole('button', { name: 'Show parts' }).click()
  await expect(row).toContainText('−₺1,200.00')
  await expect(row).toContainText('−₺300.00')
  await expect(row).toContainText('−₺100.00')

  // 30,000 − 1,600, derived from the lines rather than stored.
  await page.goto('/accounts')
  await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('₺28,400.00')
})

test('quick add records an expense in a few keystrokes', async ({ page }) => {
  const name = `Quick ${unique()}`
  await addAccount(page, name, '1000')

  const dialog = await openQuickAdd(page)
  await dialog.getByLabel('Amount').fill('85')
  await pickCategory(dialog, 0, 'dining')
  await dialog.getByLabel('Payee').fill(`Kahve ${name}`)
  await dialog.getByLabel('Account').selectOption({ label: name })
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/accounts')
  await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('₺915.00')
})

test('a payee is found by typing Turkish in plain ASCII', async ({ page }) => {
  const name = `Search ${unique()}`
  // Turkish casing and diacritics, which the search has to fold away (PLAN §7).
  const payee = `MİGROS KADIKÖY ${name}`
  await addAccount(page, name, '2000')

  const dialog = await openQuickAdd(page)
  await dialog.getByLabel('Amount').fill('240')
  await pickCategory(dialog, 0, 'groceries')
  await dialog.getByLabel('Payee').fill(payee)
  await dialog.getByLabel('Account').selectOption({ label: name })
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/transactions')
  // Not one Turkish letter typed, and the shop is still found.
  await page.getByRole('searchbox', { name: 'Search transactions' }).fill(`kadikoy ${name}`)
  await expect(page.getByText(payee)).toBeVisible()
  await expect(page).toHaveURL(/q=kadikoy/)
})

test('deleting a transaction can be undone from the toast', async ({ page }) => {
  const name = `Wallet ${unique()}`
  const payee = `Taksi ${name}`
  await addAccount(page, name, '500')

  const dialog = await openQuickAdd(page)
  await dialog.getByLabel('Amount').fill('120')
  await pickCategory(dialog, 0, 'transport')
  await dialog.getByLabel('Payee').fill(payee)
  await dialog.getByLabel('Account').selectOption({ label: name })
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/transactions')
  const row = page.getByRole('listitem').filter({ hasText: payee })
  await row.getByRole('button', { name: `Delete ${payee}` }).click()

  await expect(page.getByText(payee)).toHaveCount(0)
  // Soft-deleted, so Undo is a restore rather than a re-entry.
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByText(payee)).toBeVisible()
})

test('the filters live in the URL', async ({ page }) => {
  await page.goto('/transactions')
  await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible()

  await page.getByRole('button', { name: 'Income', exact: true }).click()
  await expect(page).toHaveURL(/view=income/)

  // Reloading the filtered URL keeps the filter, so it can be shared or bookmarked.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Income', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('an editing pass turns one expense into two categories', async ({ page }) => {
  const name = `Edit ${unique()}`
  const payee = `Market ${name}`
  await addAccount(page, name, '5000')

  const dialog = await openQuickAdd(page)
  await dialog.getByLabel('Amount').fill('1600')
  await pickCategory(dialog, 0, 'groceries')
  await dialog.getByLabel('Payee').fill(payee)
  await dialog.getByLabel('Account').selectOption({ label: name })
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/transactions')
  await page.getByRole('button').filter({ hasText: payee }).click()

  const edit = page.getByRole('dialog')
  await expect(edit).toContainText('Edit transaction')
  await edit.getByLabel('Amount').first().fill('1200')
  await edit.getByRole('button', { name: 'Split this' }).click()
  await edit.getByLabel('Amount').nth(1).fill('400')
  await pickCategory(edit, 1, 'dining')
  await edit.getByRole('button', { name: 'Save changes' }).click()
  await expect(edit).toBeHidden()

  const row = page.getByRole('listitem').filter({ hasText: payee })
  await expect(row).toContainText('−₺1,600.00')
  await expect(row).toContainText('Split')

  // The total did not change, so neither did the balance.
  await page.goto('/accounts')
  await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('₺3,400.00')
})
