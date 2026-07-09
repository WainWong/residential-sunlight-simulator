import { expect, test } from '@playwright/test';

// Drives the new create/edit session flow for observation areas:
// building overview → area home (empty) → create session → drag → save →
// edit session → cancel preserves the card. Also asserts that dragging
// on the canvas does not kick the user back to the building overview.

async function addBuildingAndOpenAreas(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
  // The overview button is labelled 观察区与窗 and opens the area home.
  await page.getByTestId('overview-edit-areas').click();
  await expect(page.getByTestId('area-home')).toBeVisible();
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

test('area create flow: empty home → drag → save shows card', async ({ page }) => {
  await addBuildingAndOpenAreas(page);

  // Empty state: hint visible, no cards yet.
  await expect(page.getByTestId('area-empty-hint')).toBeVisible();
  await expect(page.getByTestId('area-create-start')).toBeVisible();

  // Start a create session.
  await page.getByTestId('area-create-start').click();
  await expect(page.getByTestId('area-session-title')).toHaveText('新建观察区');
  await expect(page.getByTestId('area-home')).toHaveCount(0);

  // Save is disabled until a rect is drawn.
  await expect(page.getByTestId('area-save')).toBeDisabled();

  // Drag on the canvas to commit a rect — the session must stay open.
  await dragRectOnCanvas(page);
  await expect(page.getByTestId('area-session-title')).toBeVisible();
  await expect(page.getByTestId('area-save')).toBeEnabled();

  // Save returns to the home, which now lists the new area card.
  await page.getByTestId('area-save').click();
  await expect(page.getByTestId('area-home')).toBeVisible();
  await expect(page.getByTestId('area-empty-hint')).toHaveCount(0);
  const editButtons = page.locator('[data-testid^="area-edit-"]');
  await expect(editButtons).toHaveCount(1);
});

test('area edit session: cancel preserves the card', async ({ page }) => {
  await addBuildingAndOpenAreas(page);

  // Create one area so we have a card to edit.
  await page.getByTestId('area-create-start').click();
  await dragRectOnCanvas(page);
  await page.getByTestId('area-save').click();
  await expect(page.getByTestId('area-home')).toBeVisible();
  const editButton = page.locator('[data-testid^="area-edit-"]').first();
  await expect(editButton).toBeVisible();

  // Open the edit session — title switches to edit mode.
  await editButton.click();
  await expect(page.getByTestId('area-session-title')).toHaveText('编辑观察区');

  // Editing the name updates session state without removing the card on cancel.
  const nameInput = page.getByLabel('区域名称');
  await nameInput.fill('客厅');
  await expect(page.getByTestId('area-save')).toBeEnabled();

  // Cancel returns to home; the card (with original name) is still present.
  await page.getByTestId('area-cancel').click();
  await expect(page.getByTestId('area-home')).toBeVisible();
  await expect(page.locator('[data-testid^="area-edit-"]')).toHaveCount(1);
  await expect(page.getByTestId('area-empty-hint')).toHaveCount(0);
});

test('dragging on the canvas stays in area editing', async ({ page }) => {
  await addBuildingAndOpenAreas(page);

  // Start a create session, then drag. The session must remain open and
  // the building overview must not reappear.
  await page.getByTestId('area-create-start').click();
  await dragRectOnCanvas(page);
  await expect(page.getByTestId('area-session-title')).toBeVisible();
  await expect(page.getByTestId('building-overview')).toHaveCount(0);

  // Drag again — still in the session, not bounced to the overview.
  await dragRectOnCanvas(page);
  await expect(page.getByTestId('area-session-title')).toBeVisible();
  await expect(page.getByTestId('building-overview')).toHaveCount(0);
});

test('area back button returns to building overview', async ({ page }) => {
  await addBuildingAndOpenAreas(page);
  await page.getByTestId('inspector-back').click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
});
