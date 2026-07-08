import { expect, test } from '@playwright/test';

test('area editing enters top-down floor tool', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: '完成' }).click();
  await page.getByTestId('overview-edit-areas').click();
  await expect(page.getByTestId('results-panel')).toBeHidden();
  await expect(page.getByTestId('tool-draw')).toBeVisible();
  await expect(page.getByTestId('area-floor')).toBeVisible();
  await page.getByTestId('inspector-back').click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
});

test('area draft apply flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: '完成' }).click();
  await page.getByTestId('overview-edit-areas').click();

  // Initially no draft — status shows applied and results panel is hidden.
  await expect(page.getByTestId('draft-status')).toHaveText('✓ 已生效');
  await expect(page.getByTestId('results-panel')).toBeHidden();

  // Drag on the canvas to create a draft rect.
  const canvas = page.locator('#scene-canvas');
  const box = await canvas.boundingBox();
  const startX = box.x + box.width * 0.3;
  const startY = box.y + box.height * 0.3;
  const endX = box.x + box.width * 0.7;
  const endY = box.y + box.height * 0.7;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.mouse.up();

  // Draft is now pending — status reflects unapplied state.
  await expect(page.getByTestId('draft-status')).toHaveText('● 草稿未应用');
  await expect(page.getByTestId('draft-apply')).toBeVisible();
  await expect(page.getByTestId('results-panel')).toBeHidden();

  // Apply the draft.
  await page.getByTestId('draft-apply').click();

  // Draft applied — status returns to applied.
  await expect(page.getByTestId('draft-status')).toHaveText('✓ 已生效');
});
