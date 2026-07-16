import { expect, test } from '@playwright/test';
import { seedRoomProject } from './room-first-helpers.js';

test('loads a room with an explicit glass opening', async ({ page }) => {
  await seedRoomProject(page);
  await page.goto('/');
  await expect(page.getByTestId('room-tree-r1')).toContainText('客厅');
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '1', { timeout: 15000 });
  await expect(page.locator('body')).not.toContainText(/观察区|画区|擦除|进入观察区/);
});
