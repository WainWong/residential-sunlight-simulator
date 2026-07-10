import { expect, test } from '@playwright/test';

// Drives the create/edit session flow for observation areas via the left tree
// top "＋ 添加观察区" button (acts on the selected building):
// add-area → create session → drag → save → area listed in tree →
// edit session (via tree) → cancel preserves the area. Also asserts that
// dragging on the canvas does not kick the user back to the building overview.

async function addBuildingAndStartAreaCreate(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
  // The top "＋ 添加观察区" button starts a create session for the selected building.
  await page.getByTestId('area-create-start').click();
  await expect(page.getByTestId('area-session-title')).toHaveText('新建观察区');
}

async function dragRectOnCanvas(page) {
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
}

test('area create flow: drag → save lists the area in the tree', async ({ page }) => {
  await addBuildingAndStartAreaCreate(page);

  // Save is disabled until a rect is drawn.
  await expect(page.getByTestId('area-save')).toBeDisabled();

  // Drag on the canvas to commit a rect — the session must stay open.
  await dragRectOnCanvas(page);
  await expect(page.getByTestId('area-session-title')).toBeVisible();
  await expect(page.getByTestId('area-save')).toBeEnabled();

  // Save clears the session; the new area appears as a tree child.
  await page.getByTestId('area-save').click();
  await expect(page.locator('[data-testid^="area-tree-"]')).toHaveCount(1);
});

test('area edit session: cancel preserves the area', async ({ page }) => {
  await addBuildingAndStartAreaCreate(page);

  // Create one area so we have a tree node to edit.
  await dragRectOnCanvas(page);
  await page.getByTestId('area-save').click();
  const areaNode = page.locator('[data-testid^="area-tree-"]').first();
  await expect(areaNode).toBeVisible();

  // Open the edit session via the tree — title switches to edit mode.
  await areaNode.click();
  await expect(page.getByTestId('area-session-title')).toHaveText('编辑观察区');

  // Cancel returns from the session; the area is still listed in the tree.
  await page.getByTestId('area-cancel').click();
  await expect(page.locator('[data-testid^="area-tree-"]')).toHaveCount(1);
});

test('dragging on the canvas stays in area editing', async ({ page }) => {
  await addBuildingAndStartAreaCreate(page);

  // Drag on the canvas. The session must remain open and the building
  // overview must not reappear.
  await dragRectOnCanvas(page);
  await expect(page.getByTestId('area-session-title')).toBeVisible();
  await expect(page.getByTestId('building-overview')).toHaveCount(0);

  // Drag again — still in the session, not bounced to the overview.
  await dragRectOnCanvas(page);
  await expect(page.getByTestId('area-session-title')).toBeVisible();
  await expect(page.getByTestId('building-overview')).toHaveCount(0);
});

test('cancel returns to building overview', async ({ page }) => {
  await addBuildingAndStartAreaCreate(page);
  await page.getByTestId('area-cancel').click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
});
