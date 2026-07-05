import { expect, test } from '@playwright/test';

test('updates sunlight for date and time while keeping the other dimension fixed', async ({ page }) => {
  await page.goto('/');
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
  await page.goto('/');
  await page.getByLabel('时间', { exact: true }).fill('23:00');

  await expect(page.getByLabel('三维采光场景'))
    .toHaveAttribute('data-sun-above-horizon', 'false');
  await expect(page.getByTestId('direct-sun-status')).toContainText('无直射');
});
