import { expect, test } from '@playwright/test';

test('creates and positions two editable buildings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建项目' }).click();
  await expect(page.getByRole('dialog', { name: '新建采光项目' })).toBeVisible();

  await page.getByLabel('城市', { exact: true }).fill('深圳');
  await page.getByRole('option', { name: '深圳' }).click();
  await page.getByRole('button', { name: '下一步' }).click();

  await page.getByRole('button', { name: '一字型' }).click();
  await page.getByLabel('建筑名称').fill('住宅 1');
  await page.getByRole('button', { name: '添加建筑', exact: true }).click();
  await page.getByRole('button', { name: 'L 型' }).click();
  await page.getByLabel('建筑名称').fill('住宅 2');
  await page.getByRole('button', { name: '添加建筑', exact: true }).click();

  await expect(page.getByTestId('wizard-building-list')).toContainText('住宅 1');
  await expect(page.getByTestId('wizard-building-list')).toContainText('住宅 2');
  await expect(page.getByTestId('wizard-building-count')).toHaveText('2 栋建筑');
});

test('shows manual coordinate controls without requiring a map service', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.getByRole('button', { name: '手动填写经纬度' }).click();

  await expect(page.getByLabel('纬度')).toBeVisible();
  await expect(page.getByLabel('经度')).toBeVisible();
  await expect(page.getByLabel('时区')).toHaveValue('Asia/Shanghai');
});


