import { expect, test } from '@playwright/test';

test('single building: explicit modes, select does not auto-edit', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '添加建筑' }).click();
  await expect(page.getByRole('button', { name: '完成' })).toBeVisible();

  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
  await expect(page.getByTestId('area-create-start')).toBeVisible();

  await page.getByTestId('area-create-start').click();
  await expect(page.getByTestId('building-overview')).toHaveCount(0);
  // The top add-area button starts a create session directly (no area home view).
  await expect(page.getByTestId('area-session-title')).toHaveText('新建观察区');
  await page.getByTestId('area-cancel').click();
  await expect(page.getByTestId('building-overview')).toBeVisible();

  await page.getByTestId('overview-edit-building').click();
  await expect(page.getByLabel('建筑长度（米）')).toBeVisible();
});
