import { expect, test } from '@playwright/test';

test('desktop exposes sidebars and mobile exposes bottom navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '住宅采光模拟器' })).toBeVisible();

  if (test.info().project.name === 'desktop') {
    await expect(page.getByTestId('project-tree')).toBeVisible();
    await expect(page.getByTestId('inspector')).toBeVisible();
    await expect(page.getByTestId('mobile-nav')).toBeHidden();
  } else {
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    await expect(page.getByTestId('project-tree')).toBeHidden();
    await expect(page.getByTestId('inspector')).toBeHidden();
  }
});

test('switches the active mobile workspace tab', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile');
  await page.goto('/');

  await page.getByRole('button', { name: '结果' }).click();

  await expect(page.getByTestId('mobile-sheet-title')).toHaveText('分析结果');
});
