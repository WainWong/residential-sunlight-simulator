import { expect, test } from '@playwright/test';
import { dragRoomRect } from './room-first-helpers.js';

test('creates an L-capable room session and commits it to the tree', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mobile is browse-only');
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '1', { timeout: 15000 });
  // 一步流程:添加房间 → 多层楼选层面板 → 点某层立即开画。
  await page.locator('[data-testid^="add-room-"]').click();
  await page.getByTestId('pick-floor-1').click();
  await expect(page.getByTestId('room-session-title')).toHaveText('新建房间');
  await expect(page.getByTestId('room-finish')).toBeDisabled();
  await dragRoomRect(page);
  await expect(page.getByTestId('room-finish')).toBeEnabled();
  await page.getByTestId('room-finish').click();
  await expect(page.locator('[data-testid^="room-tree-"]')).toHaveCount(1);
  await expect(page.getByTestId('view-room-sunlight')).toBeVisible();
});

test('cancel leaves the building without a partial room', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mobile is browse-only');
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.locator('[data-testid^="add-room-"]').click();
  await page.getByTestId('pick-floor-1').click();
  await page.getByTestId('room-cancel').click();
  await expect(page.locator('[data-testid^="room-tree-"]')).toHaveCount(0);
});
