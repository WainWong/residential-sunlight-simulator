import { expect, test } from '@playwright/test';

test('previews, persists, reselects, and clears a coordinate-positioned building', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();

  const canvas = page.getByLabel('三维采光场景');
  await expect(canvas).toHaveAttribute('data-building-count', '1');
  await expect(canvas).not.toHaveAttribute('data-editing-building-id', '');

  await page.getByLabel('X 坐标（东为正）').fill('28');
  await page.getByLabel('Y 坐标（北为正）').fill('38');
  await page.getByLabel('旋转角度（顺时针）').fill('15');
  await page.getByRole('button', { name: '完成建筑' }).click();
  await expect(canvas).toHaveAttribute('data-editing-building-id', '');

  await page.reload();
  await expect(canvas).toHaveAttribute('data-building-count', '1');
  await page.locator('[data-testid^="building-tree-"]').click();
  await expect(page.getByLabel('X 坐标（东为正）')).toHaveValue('28');
  await expect(page.getByLabel('Y 坐标（北为正）')).toHaveValue('38');

  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '清空沙盘' }).click();
  await expect(canvas).toHaveAttribute('data-building-count', '0');
});

test('keeps the last valid value while a numeric field is invalid', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByLabel('建筑长度（米）').fill('0');

  await expect(page.getByText('长度必须大于 0')).toBeVisible();
  await page.getByLabel('建筑长度（米）').fill('72');
  await expect(page.getByText('长度必须大于 0')).toBeHidden();
});
