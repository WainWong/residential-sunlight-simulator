import { expect, test } from '@playwright/test';
import { seedRoomProject } from './room-first-helpers.js';

test('desktop exposes three-column workbench and mobile exposes navigation', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '住宅采光模拟器' })).toBeVisible();
  if (!isMobile) {
    await expect(page.getByTestId('project-tree')).toBeVisible();
    await expect(page.getByTestId('inspector')).toBeVisible();
    await expect(page.getByTestId('mobile-nav')).toBeHidden();
  } else {
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    await expect(page.getByRole('button', { name: '添加建筑' })).toBeHidden();
  }
});

test('switches the mobile browser to the room tree', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto('/');
  await page.getByTestId('mobile-nav').getByRole('button', { name: '房间', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-mobile-panel', 'buildings');
  await expect(page.getByTestId('project-tree')).toBeVisible();
});

test('keeps the mobile return-to-build action clear of the room selector', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await seedRoomProject(page);
  await page.goto('/');
  await page.getByTestId('phase-sunlight').click();

  const returnButton = await page.getByTestId('return-build').boundingBox();
  const roomSelector = await page.getByTestId('room-select').boundingBox();
  expect(returnButton).not.toBeNull();
  expect(roomSelector).not.toBeNull();
  expect(returnButton.y + returnButton.height <= roomSelector.y
    || roomSelector.y + roomSelector.height <= returnButton.y
    || returnButton.x + returnButton.width <= roomSelector.x
    || roomSelector.x + roomSelector.width <= returnButton.x).toBe(true);
});

test('hides the compass beneath the tablet inspector drawer', async ({ page, isMobile }) => {
  test.skip(isMobile, 'uses an explicit tablet viewport');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('.app-shell')).toHaveAttribute('data-tablet-panel', 'inspector');
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByLabel('北向指南针')).toBeHidden();

  await page.getByRole('button', { name: '打开当前对象面板' }).click();
  await expect(page.getByTestId('inspector')).toBeHidden();
  await expect(page.getByLabel('北向指南针')).toBeVisible();
});
