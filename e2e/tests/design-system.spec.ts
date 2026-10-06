import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => localStorage.setItem('mizan.theme', value), theme)
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await setTheme(page, theme)
    })

    test('showcase uses the design tokens', async ({ page }) => {
      await page.goto('/showcase')
      await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      const styles = await page.evaluate(() => {
        const body = getComputedStyle(document.body)
        return {
          background: body.backgroundColor,
          color: body.color,
          font: body.fontFamily,
          numerals: body.fontFeatureSettings,
        }
      })
      // Canvas and Ink from design/Mizan Design System.dc.html
      expect(styles.background).toBe(theme === 'dark' ? 'rgb(10, 12, 14)' : 'rgb(243, 241, 236)')
      expect(styles.color).toBe(theme === 'dark' ? 'rgb(232, 235, 237)' : 'rgb(28, 27, 25)')
      expect(styles.font).toContain('Geist')
      expect(styles.numerals).toContain('tnum')
    })

    for (const path of ['/', '/showcase', '/settings']) {
      test(`${path} has no accessibility violations, including contrast`, async ({ page }) => {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        const summary = results.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
        }))
        expect(summary).toEqual([])
      })
    }
  })
}

test('the amount input parses Turkish and English formats in the browser', async ({ page }) => {
  await page.goto('/showcase')
  const amount = page.getByLabel('Amount', { exact: true })
  await amount.fill('1200+350,5')
  await expect(page.getByText('= ₺1,550.50')).toBeVisible()
  await amount.blur()
  await expect(amount).toHaveValue('1,550.50')
  await expect(page.getByTestId('wire-value')).toHaveText('{"amount":"1550.50","currency":"TRY"}')
})

test('undo toast appears after confirming a delete', async ({ page }) => {
  await page.goto('/showcase')
  await page.getByRole('button', { name: 'Delete transaction…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this transaction?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Transaction deleted')).toBeVisible()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByText('Transaction restored')).toBeVisible()
})

test('layout fits the viewport without horizontal scrolling', async ({ page }) => {
  for (const path of ['/', '/showcase']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0)
  }
})

test('navigation adapts to the screen size', async ({ page, isMobile }) => {
  await page.goto('/')
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' })
  const tabBar = page.getByRole('navigation', { name: 'Tab bar' })
  if (isMobile) {
    await expect(sidebar).toBeHidden()
    await expect(tabBar).toBeVisible()
    await tabBar.getByRole('button', { name: 'More' }).click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Accounts' }).click()
  } else {
    await expect(sidebar).toBeVisible()
    await expect(tabBar).toBeHidden()
    await sidebar.getByRole('link', { name: 'Accounts' }).click()
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible()
})

test('switching to Turkish formats money the Turkish way', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mizan.language', 'tr'))
  await page.goto('/showcase')
  await expect(page.getByRole('heading', { level: 1, name: 'Tasarım sistemi' })).toBeVisible()
  await expect(page.getByTestId('money-samples')).toContainText('₺50.000,50')
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
})
