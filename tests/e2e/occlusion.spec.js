import { expect, test } from '@playwright/test';
import { seedRoomProject } from './room-first-helpers.js';

test('reports room direct-sun results through an explicit south window', async ({ page }) => {
  await seedRoomProject(page);
  await page.goto('/');
  await page.getByTestId('phase-sunlight').click();
  const panel = page.getByTestId('results-panel');
  await expect(panel).toContainText('当前直射面积比例');
  await expect(panel).toContainText('仅计算直射日光');
  await expect(panel).not.toContainText('整体采光亮度');
});
