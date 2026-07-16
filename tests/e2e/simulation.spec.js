import { expect, test } from '@playwright/test';
import { seedRoomProject } from './room-first-helpers.js';

async function enterSunlight(page) {
  await seedRoomProject(page);
  await page.goto('/');
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '1', { timeout: 15000 });
  await page.getByTestId('phase-sunlight').click();
}

test('updates direct sunlight for date and time independently', async ({ page }) => {
  await enterSunlight(page);
  const canvas = page.getByLabel('三维采光场景');
  await page.getByRole('textbox', { name: '日期' }).fill('2026-06-21');
  await page.getByLabel('时间', { exact: true }).fill('09:30');
  await expect(canvas).toHaveAttribute('data-sun-direction', /.+/, { timeout: 15000 });
  const summer = await canvas.getAttribute('data-sun-direction');
  await page.getByRole('textbox', { name: '日期' }).fill('2026-12-21');
  await expect(page.getByLabel('时间', { exact: true })).toHaveValue('09:30');
  await expect(canvas).not.toHaveAttribute('data-sun-direction', summer);
});

test('shows no direct sunlight below the horizon', async ({ page }) => {
  await enterSunlight(page);
  await page.getByLabel('时间', { exact: true }).fill('23:00');
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-sun-above-horizon', 'false', { timeout: 15000 });
  await expect(page.getByTestId('direct-sun-status')).toContainText('无直射');
});
