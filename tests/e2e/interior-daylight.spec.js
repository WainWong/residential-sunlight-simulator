import { expect, test } from '@playwright/test';

// Build a building + observation area (via the left-tree create flow used in
// area-topdown.spec.js), switch to present phase, then enter the area's
// interior view. Asserts the enter button reflects the entered state.

async function addBuildingWithArea(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
  await page.getByTestId('area-create-start').click();
  await expect(page.getByTestId('area-session-title')).toHaveText('新建观察区');

  const canvas = page.locator('#scene-canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByTestId('area-save')).toBeEnabled();
  await page.getByTestId('area-save').click();
  await expect(page.locator('[data-testid^="area-tree-"]')).toHaveCount(1);
}

test('enter an observation area interior in present phase', async ({ page }) => {
  await addBuildingWithArea(page);

  await page.getByTestId('phase-present').click();

  const enter = page.locator('[data-testid^="area-enter-"]').first();
  await expect(enter).toBeVisible();
  await expect(enter).toHaveText('进入');
  await enter.click();
  await expect(enter).toHaveText('已进入');
});
