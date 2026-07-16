import { expect, test } from '@playwright/test';
import { seedRoomProject } from './room-first-helpers.js';

test('enters a room with one sunlight action and returns outside', async ({ page, isMobile }) => {
  await seedRoomProject(page);
  await page.goto('/');
  if (isMobile) await page.getByTestId('phase-sunlight').click();
  else await page.getByTestId('view-room-sunlight').click();
  await expect(page.getByTestId('breadcrumb')).toContainText('住宅 1 / 客厅');
  await expect(page.getByTestId('results-panel')).toBeVisible();
  await page.getByTestId('return-build').click();
  await expect(page.getByTestId('phase-build')).toHaveAttribute('aria-pressed', 'true');
});
