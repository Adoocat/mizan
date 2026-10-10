import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Phase 6 end to end: allocations are typed straight into the plan, the totals follow as they
 * are typed, and a month can be copied into the next one (PLAN §20, flow F3).
 *
 * The specs share one signed-in workspace and both browser projects run against it, so each test
 * plans a **month of its own**: a plan is per workspace per month, and two tests editing the same
 * one would fight over the same lines. The months are far enough out that nothing else in the
 * suite has spending in them, which keeps every figure here predictable. The indexes skip one
 * month each, so the test that copies a plan forward owns the month it copies into too.
 */
function month(index: number, project: string): string {
  const year = (project === 'mobile' ? 2040 : 2030) + Math.floor(index / 12)
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}-01`
}

const planFor = (index: number) => month(index, test.info().project.name)

const unique = () => Math.random().toString(36).slice(2, 8)

async function openPlan(page: Page, start: string) {
  await page.goto(`/plan?month=${start}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Give every lira a job' })).toBeVisible()
  // The rows arrive with the plan; seeing one means the page is ready to type into.
  await expect(allocation(page, 'Food & groceries')).toBeVisible()
}

const allocation = (page: Page, name: string) =>
  page.getByRole('textbox', { name: `Allocation for ${name}` })

const tile = (page: Page, name: string) => page.getByRole('region', { name })

async function allocate(page: Page, name: string, amount: string) {
  const field = allocation(page, name)
  await field.fill(amount)
  // Saved when the field is left, which is also what the keyboard does.
  await field.press('Tab')
}

/**
 * An on-budget account to spend from. The specs share one workspace, so each test makes its own
 * and selects it by name: quick add defaults to the first account in the list, which belongs to
 * whichever test got there first.
 */
async function addAccount(page: Page, name: string, balance = '50000') {
  await page.goto('/accounts')
  // The page header and, in an empty workspace, the empty state both offer it.
  await page.getByRole('button', { name: 'Add account' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Account name').fill(name)
  await dialog.getByLabel('Balance today').fill(balance)
  await dialog.getByRole('button', { name: 'Add account' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible()
}

/** Quick add, from the app shell: the header button on a desktop, the + tab on a phone. */
async function openQuickAdd(page: Page) {
  await page.getByRole('button', { name: 'Add transaction' }).first().click()
  return page.getByRole('dialog')
}

/** Picks a category in the combo box by typing and choosing from its own listbox. */
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

/** Records an expense dated inside the month being planned. */
async function addExpense(
  page: Page,
  {
    category,
    amount,
    date,
    account,
  }: { category: string; amount: string; date: string; account: string },
) {
  const dialog = await openQuickAdd(page)
  await dialog.getByLabel('Amount').first().fill(amount)
  await pickCategory(dialog, category)
  await dialog.getByLabel('Account').selectOption({ label: account })
  await dialog.getByLabel('Date').fill(date)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
}

async function addIncome(page: Page, amount: string) {
  await page.getByRole('button', { name: 'Add income' }).click()
  const panel = page.getByRole('region', { name: 'Expected income' })
  await panel.getByLabel('Expected amount').fill(amount)
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(tile(page, 'Income available')).toContainText('₺50,000')
}

test('allocations are typed in place and the totals follow', async ({ page }) => {
  const start = planFor(0)
  await openPlan(page, start)
  await addIncome(page, '50000')

  await allocate(page, 'Food & groceries', '6000')
  await expect(tile(page, 'Allocated')).toContainText('₺6,000')
  await expect(tile(page, 'Left to allocate')).toContainText('₺44,000')

  await allocate(page, 'Rent', '9500')
  await expect(tile(page, 'Allocated')).toContainText('₺15,500')

  // Everything else at once, bringing "left to allocate" to zero.
  await allocate(page, 'Available to spend', '34500')
  await expect(tile(page, 'Left to allocate')).toContainText('₺0')
  await expect(page.getByText('Fully allocated')).toBeVisible()

  // It is the API that holds the plan, not the page.
  await page.reload()
  await expect(allocation(page, 'Food & groceries')).toHaveValue('6,000.00')
  await expect(tile(page, 'Allocated')).toContainText('₺50,000')
})

test('the totals move while an amount is still being typed', async ({ page }) => {
  const start = planFor(2)
  await openPlan(page, start)
  await allocate(page, 'Rent', '9500')

  // Typing without leaving the field: the preview is the domain's arithmetic, not the server's.
  await allocation(page, 'Food & groceries').fill('6000')
  await expect(tile(page, 'Allocated')).toContainText('₺15,500')
})

test('a pooled category takes a line of its own, and gives it back', async ({ page }) => {
  const start = planFor(4)
  await openPlan(page, start)

  // Flexible spending with no line of its own is covered by the pool (§10), so the row has no
  // amount until one is asked for.
  const dining = page.getByTestId('plan-row').filter({ hasText: 'Dining out' })
  await expect(dining.getByText('from pool')).toBeVisible()

  await dining.getByRole('button', { name: 'Give Dining out its own amount' }).click()
  await allocate(page, 'Dining out', '2600')
  await expect(allocation(page, 'Dining out')).toHaveValue('2,600.00')
  await expect(tile(page, 'Allocated')).toContainText('₺2,600')

  // Clearing the amount hands it back: the pool answers for it again.
  await allocate(page, 'Dining out', '')
  await expect(dining.getByText('from pool')).toBeVisible()
  await expect(allocation(page, 'Dining out')).toHaveCount(0)
  await expect(tile(page, 'Allocated')).toContainText('₺0')
})

test('a month can be copied into the next one', async ({ page }) => {
  const source = planFor(6)
  await openPlan(page, source)
  await allocate(page, 'Rent', '9500')
  await allocate(page, 'Food & groceries', '6000')

  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(allocation(page, 'Rent')).toHaveValue('0.00')

  await page.getByRole('button', { name: /^Copy from/ }).click()
  await expect(allocation(page, 'Rent')).toHaveValue('9,500.00')
  await expect(allocation(page, 'Food & groceries')).toHaveValue('6,000.00')
  await expect(tile(page, 'Allocated')).toContainText('₺15,500')
})

test('the month lives in the URL', async ({ page }) => {
  const start = planFor(8)
  await openPlan(page, start)

  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page).toHaveURL(/month=/)
  const next = new URL(page.url()).searchParams.get('month')
  expect(next).not.toBe(start)

  // Reloading the month's URL opens the same month, so it can be shared or bookmarked.
  await page.reload()
  await expect(page).toHaveURL(new RegExp(`month=${next}`))
})

/**
 * Phase 7: what can be spent, and the daily allowance it divides into.
 *
 * The months these tests plan are years ahead of the clock, so nothing in them is dated "before
 * today" and the whole pool divides over the whole month — which makes every figure here exact.
 */
test('the daily allowance divides what is left over the days that remain', async ({ page }) => {
  // A 31-day month, so the division is exact: index 16 is May.
  const start = planFor(16)
  await openPlan(page, start)
  await addIncome(page, '50000')
  await allocate(page, 'Available to spend', '3100')

  const panel = page.getByRole('region', { name: 'Safe to spend today' })
  // A 31-day month: ₺3,100 ÷ 31 is ₺100 a day.
  await expect(panel).toContainText('₺100')
  await expect(panel).toContainText('₺0 spent today')

  await panel.getByRole('button', { name: /^How Safe to spend today/ }).click()
  const explain = page.getByRole('group', { name: 'Safe to spend today' })
  await expect(explain).toContainText('Available to spend this month')
  await expect(explain).toContainText('₺3,100')
  await expect(explain).toContainText('÷ 31 days left')
})

test('an overspend comes off what can be spent, and Cover says who paid', async ({ page }) => {
  const start = planFor(18)
  const account = `Cover ${unique()}`
  await addAccount(page, account)
  await openPlan(page, start)
  await addIncome(page, '50000')
  await allocate(page, 'Available to spend', '3100')
  // An essential category, so the row has an amount to type into from the start: a flexible one
  // is covered by the pool until it is given a line of its own.
  await allocate(page, 'Transport', '500')
  await allocate(page, 'Food & groceries', '6000')

  // Spend ₺610 on a ₺500 line, inside the month being planned.
  await addExpense(page, { category: 'transport', amount: '610', date: start, account })
  await openPlan(page, start)

  const panel = page.getByRole('region', { name: 'Safe to spend today' })
  // Decision D4: the ₺110 is off the figure before anyone acknowledges it.
  await expect(panel).toContainText('₺2,990')
  await expect(panel).toContainText('₺110 overspent elsewhere')

  const row = page.getByTestId('plan-row').filter({ hasText: 'Transport' })
  await row.getByRole('button', { name: /^Cover/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Overspent by')
  // The option carries what the line has left, so it is matched by its leading name.
  const source = dialog.getByLabel('Take it from')
  await source.selectOption({
    label: (await source.locator('option').allTextContents()).find((text) =>
      text.startsWith('Food & groceries'),
    )!,
  })
  await dialog.getByRole('button', { name: 'Cover it' }).click()
  await expect(dialog).toBeHidden()

  // The money came from groceries, so the pool keeps its ₺3,100 and the overspend is gone.
  await expect(row).toContainText('covered ₺110')
  await expect(panel).toContainText('₺3,100')
  await expect(panel).not.toContainText('overspent elsewhere')
})

test('quick add says what an expense would do before it is saved', async ({ page }) => {
  const start = planFor(20)
  const account = `Impact ${unique()}`
  await addAccount(page, account)
  await openPlan(page, start)
  await addIncome(page, '50000')
  await allocate(page, 'Food & groceries', '6000')

  const dialog = await openQuickAdd(page)
  await dialog.getByLabel('Amount').first().fill('500')
  await pickCategory(dialog, 'groceries')
  await dialog.getByLabel('Account').selectOption({ label: account })
  await dialog.getByLabel('Date').fill(start)

  // The line has ₺6,000 and nothing spent on it yet.
  await expect(dialog.getByTestId('budget-impact')).toContainText('₺6,000 → ₺5,500')
})
