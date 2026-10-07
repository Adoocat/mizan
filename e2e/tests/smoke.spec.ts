import { expect, test } from '@playwright/test'

test('app shell loads for a signed-in user and reports a healthy API', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: /Good afternoon|Good morning|Good evening/ }),
  ).toBeVisible()
  await expect(page.getByTestId('health')).toHaveAttribute('data-state', 'ok')
})
