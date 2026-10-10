import { expect, test, type Page } from '@playwright/test'

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
