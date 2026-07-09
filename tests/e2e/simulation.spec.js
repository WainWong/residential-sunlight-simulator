import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/unobstructed-south-window.json'
);

// The timeline and results are only visible in the present phase, so each
// simulation test imports a project that already has an observation area and
// switches to present before driving the timeline.
async function enterPresentWithArea(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '导入' }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await page.getByTestId('phase-present').click();
}

test('updates sunlight for date and time while keeping the other dimension fixed', async ({ page }) => {
  await enterPresentWithArea(page);
  const canvas = page.getByLabel('三维采光场景');

  await page.getByRole('textbox', { name: '日期' }).fill('2026-06-21');
  await page.getByLabel('时间', { exact: true }).fill('09:30');
  await expect(canvas).toHaveAttribute('data-sun-direction', /.+/);
  const summerDirection = await canvas.getAttribute('data-sun-direction');

  await page.getByRole('textbox', { name: '日期' }).fill('2026-12-21');
  await expect(page.getByLabel('时间', { exact: true })).toHaveValue('09:30');
  await expect(canvas).not.toHaveAttribute('data-sun-direction', summerDirection);

  const winterDirection = await canvas.getAttribute('data-sun-direction');
  await page.getByLabel('时间', { exact: true }).fill('14:00');
  await expect(page.getByRole('textbox', { name: '日期' })).toHaveValue('2026-12-21');
  await expect(canvas).not.toHaveAttribute('data-sun-direction', winterDirection);
});

test('shows no direct sunlight below the horizon', async ({ page }) => {
  await enterPresentWithArea(page);
  await page.getByLabel('时间', { exact: true }).fill('23:00');

  await expect(page.getByLabel('三维采光场景'))
    .toHaveAttribute('data-sun-above-horizon', 'false');
  await expect(page.getByTestId('direct-sun-status')).toContainText('无直射');
});
