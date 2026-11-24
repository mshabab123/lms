import { expect, test } from '@playwright/test';

test.describe('app shell and i18n', () => {
  test('defaults to Arabic RTL and switches to English LTR', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('تدريب مباشر');
    await page.getByRole('button', { name: 'التبديل إلى اللغة الإنجليزية' }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('instructor-led');
  });

  test('protected pages redirect anonymous visitors to sign in', async ({ page }) => {
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/en\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('has no horizontal scroll on public pages', async ({ page }) => {
    for (const path of ['/ar', '/ar/register', '/en/login']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect({ path, overflow }).toEqual({ path, overflow: false });
    }
  });
});
