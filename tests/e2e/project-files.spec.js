import { expect, test } from '@playwright/test';

test('downloads a versioned project file', async ({ page }) => {
  await page.goto('/');
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '保存项目' }).click()
  ]);

  expect(download[0].suggestedFilename()).toMatch(/\.sunlight\.json$/);
});

test('exports a watermarked scene screenshot', async ({ page }) => {
  await page.goto('/');
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出截图' }).click()
  ]);

  expect(download[0].suggestedFilename()).toMatch(/\.png$/);
});

