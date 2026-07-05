import { expect, test } from '@playwright/test';

test('opens as an empty sandbox without an example overlay', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('empty-sandbox-hint')).toBeVisible();
  await expect(page.getByTestId('grid-scale')).toHaveText('每格 10 米');
  await expect(page.getByLabel('北向指南针')).toBeVisible();
  await expect(page.getByRole('button', { name: '打开示例项目' })).toHaveCount(0);
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '0');
});
