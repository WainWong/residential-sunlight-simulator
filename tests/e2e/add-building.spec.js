import { expect, test } from '@playwright/test';

test('adds two buildings and shows them in the scene tree', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: '完成建筑' }).click();

  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: '完成建筑' }).click();

  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '2');
  const rows = page.locator('[data-testid^="building-tree-"]');
  await expect(rows).toHaveCount(2);
});
