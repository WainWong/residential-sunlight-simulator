import { expect, test } from '@playwright/test';

test('updates current and daily results when time changes', async ({ page }) => {
  await page.goto('/?fixture=unobstructed-south-window');

  await page.getByLabel('时间', { exact: true }).fill('12:00');

  await expect(page.getByTestId('direct-sun-status')).toContainText('有直射');
  await expect(page.getByTestId('solar-altitude')).not.toContainText('--');
  await expect(page.getByTestId('daily-total')).toContainText('5 小时 26 分');
  await expect(page.getByTestId('current-time')).toHaveText('12:00');
});

test('reports no direct sun outside the demo interval', async ({ page }) => {
  await page.goto('/?fixture=unobstructed-south-window');

  await page.getByLabel('时间', { exact: true }).fill('16:00');

  await expect(page.getByTestId('direct-sun-status')).toContainText('无直射');
  await expect(page.getByTestId('current-time')).toHaveText('16:00');
});

