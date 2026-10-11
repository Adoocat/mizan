import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Phase 8 end to end: the Goals page shows all three types, contributions move a goal, and a
 * goal added to the plan is measured against what it receives (PLAN §20, §9, flows F7 and F8).
 *
 * The specs share one signed-in workspace and both browser projects run against it, so every
 * goal here is named with a unique suffix: a test that matched on "Japan trip" would otherwise
 * find whichever run created one first. Goals are archived at the end of the tests that would
 * otherwise leave a standing earmark behind.
 */
const unique = () => Math.random().toString(36).slice(2, 8)

async function openGoals(page: Page) {
  await page.goto('/goals')
  await expect(page.getByRole('heading', { level: 1, name: 'Goals' })).toBeVisible()
}

/** The card for one goal, found by its heading. */
const card = (page: Page, name: string) =>
  page.locator('article').filter({ has: page.getByRole('heading', { name, level: 3 }) })

async function newGoal(
  page: Page,
  fields: {
    type: string
    name: string
    target?: string
    date?: string
    months?: string
    repeat?: string
  },
): Promise<Locator> {
  await page.getByRole('button', { name: 'New goal' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Kind of goal').selectOption(fields.type)
  await dialog.getByLabel('Name').fill(fields.name)

  if (fields.months) await dialog.getByLabel('Months of cover').selectOption(fields.months)
  if (fields.target) await dialog.getByLabel('Target', { exact: true }).fill(fields.target)
  if (fields.date) {
    const label = fields.type === 'sinking_fund' ? 'Due date' : 'Target date (optional)'
    await dialog.getByLabel(label).fill(fields.date)
  }
  if (fields.repeat) await dialog.getByLabel('Comes round again').selectOption(fields.repeat)

  await dialog.getByRole('button', { name: 'Create goal' }).click()
  await expect(dialog).toBeHidden()

  const created = card(page, fields.name)
  await expect(created).toBeVisible()
  return created
}

/** Earmarks money for a goal, or releases it: the same dialog in both directions (flow F8). */
async function contribute(
  page: Page,
  goal: Locator,
  amount: string,
  direction: 'Earmark' | 'Release' = 'Earmark',
) {
  await goal.getByRole('button', { name: 'Contribute' }).click()
  const dialog = page.getByRole('dialog')
  if (direction === 'Release') await dialog.getByRole('radio', { name: 'Release' }).click()
  await dialog.getByLabel(`Amount to ${direction.toLowerCase()}`).fill(amount)
  await dialog.getByRole('button', { name: `${direction} money` }).click()
  await expect(dialog).toBeHidden()
}

async function archive(page: Page, goal: Locator) {
  await goal.getByRole('button', { name: 'Archive' }).click()
  await expect(goal).toBeHidden()
}

test('a savings goal says what it needs each month', async ({ page }) => {
  await openGoals(page)
  const name = `Japan trip ${unique()}`

  // ₺36,000 by the end of 2032: a round number over a known run of months.
  const goal = await newGoal(page, {
    type: 'savings',
    name,
    target: '36000',
    date: '2032-12-15',
  })

  await expect(goal).toContainText('Savings goal')
  await expect(goal).toContainText('₺0')
  await expect(goal).toContainText('₺36,000')
  // The target date is shown, and the monthly figure is derived from the months to it.
  await expect(goal).toContainText('15 Dec 2032')
  await expect(goal).toContainText('Needs')

  await archive(page, goal)
})

test('a goal with no date shows progress instead of a monthly amount', async ({ page }) => {
  await openGoals(page)
  const name = `New computer ${unique()}`

  const goal = await newGoal(page, { type: 'savings', name, target: '40000' })

  // Decided for this phase: no date means no denominator, so no monthly figure is invented.
  await expect(goal).toContainText('No target date, so no monthly amount to aim for')
  await expect(goal).not.toContainText('Needs')

  await archive(page, goal)
})

test('an emergency fund takes months of cover, not a target', async ({ page }) => {
  await openGoals(page)
  const name = `Emergency fund ${unique()}`

  await page.getByRole('button', { name: 'New goal' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Kind of goal').selectOption('emergency_fund')

  // Its target comes from the plan's essentials, so the form never asks for one.
  await expect(dialog.getByLabel('Months of cover')).toBeVisible()
  await expect(dialog.getByLabel('Target', { exact: true })).toBeHidden()
  await expect(dialog).toContainText('of essentials and debt a month')

  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Months of cover').selectOption('3')
  await dialog.getByRole('button', { name: 'Create goal' }).click()
  await expect(dialog).toBeHidden()

  const goal = card(page, name)
  await expect(goal).toContainText('Emergency fund')
  await archive(page, goal)
})

test('a sinking fund needs the date its bill falls due', async ({ page }) => {
  await openGoals(page)
  const name = `Kasko ${unique()}`

  await page.getByRole('button', { name: 'New goal' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Kind of goal').selectOption('sinking_fund')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Target', { exact: true }).fill('15000')

  // Without a due date nothing is sent: a bill with no date is not a sinking fund.
  await dialog.getByRole('button', { name: 'Create goal' }).click()
  await expect(dialog).toBeVisible()

  await dialog.getByLabel('Due date').fill('2032-02-10')
  await dialog.getByLabel('Comes round again').selectOption('annual')
  await dialog.getByRole('button', { name: 'Create goal' }).click()
  await expect(dialog).toBeHidden()

  const goal = card(page, name)
  await expect(goal).toContainText('Sinking fund')
  await archive(page, goal)
})

test('earmarking moves the goal, and releasing moves it back', async ({ page }) => {
  await openGoals(page)
  const name = `Japan trip ${unique()}`
  const goal = await newGoal(page, { type: 'savings', name, target: '35000', date: '2032-07-15' })

  await contribute(page, goal, '24500')
  await expect(goal).toContainText('₺24,500')
  // 24,500 of 35,000 is 70%, which the ring reports in the middle.
  await expect(goal).toContainText('70%')

  await contribute(page, goal, '4500', 'Release')
  await expect(goal).toContainText('₺20,000')

  await archive(page, goal)
})

test('a release is capped at what the goal holds, before anything is sent', async ({ page }) => {
  await openGoals(page)
  const name = `Capped ${unique()}`
  const goal = await newGoal(page, { type: 'savings', name, target: '10000' })

  await contribute(page, goal, '1000')

  await goal.getByRole('button', { name: 'Contribute' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Release' }).click()
  await dialog.getByLabel('Amount to release').fill('5000')

  await expect(dialog).toContainText('That is more than this goal holds.')
  await expect(dialog.getByRole('button', { name: 'Release money' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await archive(page, goal)
})

test('a goal added to the plan is measured against what it receives', async ({ page }) => {
  await openGoals(page)
  const name = `Planned goal ${unique()}`
  const goal = await newGoal(page, { type: 'savings', name, target: '12000', date: '2032-12-15' })

  // "Add to plan" takes the monthly figure the page has just shown, with nothing to retype.
  await goal.getByRole('button', { name: 'Add to plan' }).click()
  await expect(goal).toContainText('In this month’s plan:')
  await expect(goal.getByRole('button', { name: 'Add to plan' })).toBeHidden()

  // The plan now carries a goal line, named with the goal's own words, and a contribution is
  // what that line measures (§10).
  await contribute(page, goal, '200')

  await page.goto('/plan')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  /*
   * The row is found by the goal's name rather than by a group total: the specs share one
   * workspace and one current month, so every other test's contributions land in the same
   * group and only this row is this test's own.
   */
  const row = page.getByRole('textbox', { name: `Allocation for ${name}` })
  // ₺12,000 over the 75 months to December 2032, which "Add to plan" filled in by itself.
  // The field's own formatting is the currency input's business, so the figure is what matters.
  await expect(row).toHaveValue(/160/)

  await openGoals(page)
  await archive(page, card(page, name))
})

test('an archived goal keeps its history and can be brought back', async ({ page }) => {
  await openGoals(page)
  const name = `Archived ${unique()}`
  const goal = await newGoal(page, { type: 'savings', name, target: '5000' })
  await contribute(page, goal, '1500')

  await archive(page, goal)

  await page.getByRole('button', { name: 'Show archived' }).click()
  const archived = card(page, name)
  await expect(archived).toContainText('Archived')
  // Its earmark is history: nothing new can go in until it is brought back.
  await expect(archived.getByRole('button', { name: 'Contribute' })).toBeHidden()

  await archived.getByRole('button', { name: 'Bring back' }).click()
  // The contributions were kept, so the goal comes back holding what it held.
  await expect(card(page, name)).toContainText('₺1,500')

  // Archived goals are still on screen here, so the card stays and takes the badge instead.
  await page.getByRole('button', { name: 'Hide archived' }).click()
  await archive(page, card(page, name))
})
