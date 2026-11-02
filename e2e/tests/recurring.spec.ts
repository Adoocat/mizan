import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Phase 9 end to end: a recurring rule becomes an occurrence, confirming it writes exactly one
 * transaction, and skipping one leaves the series alone (PLAN §20, §11, flow F6).
 *
 * The specs share one signed-in workspace and both browser projects run against it, so every
 * rule here is named with a unique suffix and deleted at the end — a standing rule would otherwise
 * put its own payments into every other spec's upcoming list.
 */
const unique = () => Math.random().toString(36).slice(2, 8)

/** Today, as the API's own time zone sees it. The rules are anchored to it so dates stay stable. */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

async function openUpcoming(page: Page) {
  await page.goto('/calendar')
  await expect(page.getByRole('heading', { level: 1, name: 'Upcoming' })).toBeVisible()
}

/**
 * An account of this test's own to pay from, the way the plan and transaction specs do.
 *
 * A rule needs somewhere for the money to leave, and a spec that borrowed another spec's account
 * would only pass when that one had run first.
 */
async function newAccount(page: Page): Promise<string> {
  const name = `Recurring ${unique()}`
  await page.goto('/accounts')
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible()

  await page.getByRole('button', { name: 'Add account' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account name').fill(name)
  await dialog.getByLabel('Balance today').fill('25000')
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()

  return name
}

const schedule = (page: Page) => page.getByRole('region', { name: 'Schedule' })
const rulesPanel = (page: Page) => page.getByRole('region', { name: 'Recurring each month' })

/** One row of a panel, found by the rule it belongs to. */
const rowFor = (panel: Locator, name: string) => panel.locator('li').filter({ hasText: name })

/** Chooses a category in the combo box, the same way the plan and quick-add specs do. */
async function pickCategory(dialog: Locator, query: string) {
  const field = dialog.getByRole('combobox', { name: 'Category' }).first()
  await field.click()
  await field.fill(query)
  await dialog
    .getByRole('listbox', { name: 'Category' })
    .getByRole('option', { name: new RegExp(query, 'i') })
    .first()
    .click()
}

async function newRule(
  page: Page,
  fields: {
    name: string
    amount: string
    startDate: string
    /** Which category the payment belongs to; the plan has to be able to see it (§10). */
    category: string
    account: string
    estimated?: boolean
  },
): Promise<void> {
  await page.getByRole('button', { name: 'Add recurring' }).first().click()
  const dialog = page.getByRole('dialog')

  await dialog.getByLabel('Name').fill(fields.name)
  await dialog.getByLabel('Amount', { exact: true }).fill(fields.amount)
  if (fields.estimated) await dialog.getByRole('radio', { name: 'Estimated' }).click()
  await dialog.getByLabel('Paid from').selectOption({ label: fields.account })
  await pickCategory(dialog, fields.category)
  await dialog.getByLabel('First one on').fill(fields.startDate)
  await dialog.getByRole('button', { name: 'Add rule' }).click()
  await expect(dialog).toBeHidden()

  await expect(rowFor(rulesPanel(page), fields.name)).toBeVisible()
}

async function deleteRule(page: Page, name: string) {
  await rowFor(rulesPanel(page), name).getByRole('button', { name: 'Delete' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(dialog).toBeHidden()
  await expect(rowFor(rulesPanel(page), name)).toBeHidden()
}

test('a rule due today shows up, and confirming it records one transaction', async ({ page }) => {
  const name = `Superonline ${unique()}`
  const account = await newAccount(page)
  await openUpcoming(page)
  await newRule(page, { name, amount: '549', startDate: today(), category: 'Utilities', account })

  // It is due today, so it is the first thing the schedule has to say.
  const row = rowFor(schedule(page), name)
  await expect(row).toBeVisible()
  await expect(row).toContainText('₺549')

  await row.getByRole('button', { name: 'Confirm' }).click()
  const dialog = page.getByRole('dialog')
  // The amount is prefilled from the rule, and editable: this bill came to ₺612.40.
  await expect(dialog.getByLabel('Amount that moved')).toHaveValue('549.00')
  await dialog.getByLabel('Amount that moved').fill('612.40')
  await dialog.getByRole('button', { name: 'Record it' }).click()
  await expect(dialog).toBeHidden()

  // Gone from the schedule, because it is no longer something to do.
  await expect(rowFor(schedule(page), name)).toBeHidden()

  // And in the ledger exactly once, for what actually left the account (§11's duplicate check).
  await page.goto(`/transactions?q=${encodeURIComponent(name)}`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const matches = page.getByRole('listitem').filter({ hasText: name })
  await expect(matches).toHaveCount(1)
  await expect(matches.first()).toContainText('612.40')

  await openUpcoming(page)
  await deleteRule(page, name)
})

test('skipping one occurrence leaves the rest of the series alone', async ({ page }) => {
  const name = `Gym ${unique()}`
  const account = await newAccount(page)
  await openUpcoming(page)
  await newRule(page, {
    name,
    amount: '980',
    startDate: today(),
    category: 'Subscriptions',
    account,
  })

  await rowFor(schedule(page), name).getByRole('button', { name: 'Skip' }).click()
  await expect(rowFor(schedule(page), name)).toBeHidden()

  // The rule is still running: skipping is about one occurrence, never the series.
  const rule = rowFor(rulesPanel(page), name)
  await expect(rule).toBeVisible()
  await expect(rule).not.toContainText('Paused')
  await expect(rule).toContainText('Every month')

  await deleteRule(page, name)
})

test('an estimated amount is marked as one until it is confirmed', async ({ page }) => {
  const name = `Enerjisa ${unique()}`
  const account = await newAccount(page)
  await openUpcoming(page)
  await newRule(page, {
    name,
    amount: '720',
    startDate: today(),
    category: 'Utilities',
    account,
    estimated: true,
  })

  const row = rowFor(schedule(page), name)
  await expect(row).toContainText('estimated')
  await expect(row).toContainText('~')

  await deleteRule(page, name)
})

test('a paused rule stops producing occurrences, and resuming brings it back', async ({ page }) => {
  // Not named "Paused …": the badge is asserted by text, and a rule whose own name contained the
  // word could never stop matching it.
  const name = `Gym break ${unique()}`
  const account = await newAccount(page)
  await openUpcoming(page)
  await newRule(page, { name, amount: '100', startDate: today(), category: 'Utilities', account })

  const rule = rowFor(rulesPanel(page), name)
  await rule.getByRole('button', { name: 'Pause' }).click()
  await expect(rule).toContainText('Paused')
  await expect(rowFor(schedule(page), name)).toBeHidden()

  await rule.getByRole('button', { name: 'Resume' }).click()
  await expect(rule).not.toContainText('Paused')
  await expect(rowFor(schedule(page), name)).toBeVisible()

  await deleteRule(page, name)
})

test('the plan can be filled in from the recurring rules', async ({ page }) => {
  const name = `Netflix ${unique()}`
  const account = await newAccount(page)
  await openUpcoming(page)
  await newRule(page, {
    name,
    amount: '222',
    startDate: today(),
    category: 'Subscriptions',
    account,
  })

  await page.goto('/plan')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  /*
   * Only the outcome is asserted here: the category ends up with an allocation (flow F3).
   *
   * Whether *this* rule is the one the plan was missing is shared state — both browser projects
   * run this spec against one workspace and one current month, so whichever gets there first
   * covers the category for both. §11's warning itself is pinned down where it is deterministic:
   * `recurring.int.test.ts` for the rule, and `plan.test.tsx` for the panel.
   */
  await page.getByRole('button', { name: 'Fill from recurring' }).click()

  const allocation = page.getByRole('textbox', { name: 'Allocation for Subscriptions' })
  await expect(allocation).not.toHaveValue('')
  await expect(allocation).not.toHaveValue('0.00')

  await openUpcoming(page)
  await deleteRule(page, name)
})
