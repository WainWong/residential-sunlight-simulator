import { expect, test } from '@playwright/test';

test('adds buildings on desktop and keeps mobile browse-only', async ({ page, isMobile }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: '添加建筑' });
  if (isMobile) {
    await expect(add).toBeHidden();
    return;
  }
  await add.click();
  await add.click();
  await expect(page.locator('[data-testid^="building-tree-"]')).toHaveCount(2);
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '2', { timeout: 15000 });
});
