import { expect, test } from '@playwright/test';

test('bundled example opens with a valid result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '打开示例项目' }).click();

  await expect(page.getByTestId('active-area-name')).toContainText('客厅观察区');
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '1');
  await expect(page.getByTestId('daily-total')).not.toContainText('--');
});
