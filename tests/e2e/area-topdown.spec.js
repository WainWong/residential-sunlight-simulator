import { expect, test } from '@playwright/test';

test('area editing enters top-down floor tool', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: '完成' }).click();
  await page.getByTestId('overview-edit-areas').click();
  await expect(page.getByTestId('results-panel')).toBeHidden();
  await expect(page.getByTestId('tool-draw')).toBeVisible();
  await expect(page.getByTestId('area-floor')).toBeVisible();
  await page.getByTestId('inspector-back').click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
});
