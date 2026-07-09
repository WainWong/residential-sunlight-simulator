import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/unobstructed-south-window.json'
);

test('imports a south-window project and reports direct sun', async ({ page }) => {
  await page.goto('/');
  // 触发隐藏 file input
  await page.getByRole('button', { name: '导入' }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  // Results are only shown in the present phase; the fixture has an area so
  // switching is allowed.
  await page.getByTestId('phase-present').click();
  // 无观察区选择（单区），结果面板应展示直射状态（非“暂无观察区”）
  const status = page.getByTestId('direct-sun-status');
  await expect(status).not.toHaveText('暂无观察区');
  // 全天时段占位保持“尚未计算”，不出现旧硬编码
  await expect(page.getByTestId('results-panel')).toContainText('尚未计算');
  await expect(page.getByTestId('results-panel')).not.toContainText('09:12');
});
