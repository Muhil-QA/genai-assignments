import { test, expect } from '@playwright/test';

test('example page loads successfully', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Example Domain/);
  await expect(page.getByRole('heading', { name: 'Example Domain' })).toBeVisible();
});
