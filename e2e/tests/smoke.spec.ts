import { expect, test } from '@playwright/test'

test('app shell loads and reports a healthy API', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
  await expect(page.getByTestId('health')).toHaveAttribute('data-state', 'ok')
})
