import { expect, test } from '@playwright/test';

async function reachObservationStep(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.getByLabel('城市', { exact: true }).fill('深圳');
  await page.getByRole('option', { name: '深圳' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '一字型' }).click();
  await page.getByRole('button', { name: '添加建筑', exact: true }).click();
  await page.getByRole('button', { name: '下一步' }).click();
}

test('paints an area and attaches a south-facing window', async ({ page }) => {
  await reachObservationStep(page);

  await page.getByLabel('目标楼层').fill('9');
  await page.getByRole('button', { name: '编辑观察区域' }).click();
  await page.getByTestId('grid-cell-2-1').click();
  await page.getByTestId('grid-cell-2-2').click();
  await expect(page.getByTestId('selected-area')).toContainText('2㎡');

  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '添加普通窗' }).click();
  await page.getByTestId('wall-south-0').click();
  await expect(page.getByTestId('opening-summary')).toContainText('普通窗');
  await expect(page.getByTestId('opening-summary')).toContainText('南侧外墙');
});

test('supports erase mode for irregular observation areas', async ({ page }) => {
  await reachObservationStep(page);
  await page.getByRole('button', { name: '编辑观察区域' }).click();
  await page.getByTestId('grid-cell-1-1').click();
  await page.getByTestId('grid-cell-1-2').click();
  await page.getByRole('button', { name: '擦除' }).click();
  await page.getByTestId('grid-cell-1-1').click();

  await expect(page.getByTestId('selected-area')).toContainText('1㎡');
});
