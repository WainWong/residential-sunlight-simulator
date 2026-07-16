import { expect, test } from '@playwright/test';

async function dragResizeIcon(page, controlSelector, distanceOrder) {
  const canvasBox = await page.getByLabel('三维采光场景').boundingBox();
  const icons = page.locator(`${controlSelector}:not([hidden])`);
  const count = await icons.count();
  expect(count).toBeGreaterThan(0);

  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const box = await icons.nth(index).boundingBox();
    if (!box) continue;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const dx = x - (canvasBox.x + canvasBox.width / 2);
    const dy = y - (canvasBox.y + canvasBox.height / 2);
    candidates.push({ x, y, dx, dy, distance: Math.hypot(dx, dy) });
  }
  candidates.sort((left, right) => left.distance - right.distance);
  const handle = distanceOrder === 'nearest' ? candidates[0] : candidates.at(-1);
  const magnitude = Math.hypot(handle.dx, handle.dy) || 1;

  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.dx / magnitude * 36,
    handle.y + handle.dy / magnitude * 36,
    { steps: 8 }
  );
  await page.mouse.up();
}

test('keeps transform editing on canvas and persists vertical settings', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mobile is browse-only');
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await expect(page.getByLabel('X 坐标（东为正）')).toHaveCount(0);
  await expect(page.getByLabel('Y 坐标（北为正）')).toHaveCount(0);
  await expect(page.getByLabel('建筑长度（米）')).toHaveCount(0);
  await expect(page.getByLabel('建筑宽度（米）')).toHaveCount(0);
  await expect(page.getByLabel('旋转角度（顺时针）')).toHaveCount(0);

  await page.getByLabel('楼层数').fill('12');
  await page.getByLabel('楼层数').press('Tab');
  await page.getByLabel('标准层高（米）').fill('3.2');
  await page.getByLabel('标准层高（米）').press('Tab');
  await expect(page.getByLabel('楼层数')).toHaveValue('12');
  await expect(page.getByLabel('标准层高（米）')).toHaveValue('3.2');
  await expect.poll(() => page.evaluate(() => {
    const text = localStorage.getItem('residential-sunlight-simulator:draft:v2');
    if (!text) return null;
    const building = JSON.parse(text).buildings[0];
    return {
      floors: building?.params?.floors,
      floorHeight: building?.params?.floorHeight
    };
  })).toEqual({ floors: 12, floorHeight: 3.2 });
  await page.reload();
  await expect(page.getByLabel('楼层数')).toHaveValue('12');
  await expect(page.getByLabel('标准层高（米）')).toHaveValue('3.2');
});

test('clears the complete room-first scene', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mobile is browse-only');
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '清空' }).click();
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '0');
});

test('switches building geometry and commits outer and inner dimension drags', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mobile is browse-only');
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();

  await expect(page.getByTestId('building-context').locator('input[type="number"]')).toHaveCount(2);
  await page.getByLabel('楼层数').fill('1');
  await page.getByLabel('楼层数').press('Tab');
  await expect(page.getByLabel('楼层数')).toHaveValue('1');
  const typeSelect = page.getByLabel('建筑类型');
  await expect(page.locator('[data-gizmo-icon="resize"]')).toHaveCount(4);

  await typeSelect.selectOption('lShape');
  await expect(page.locator('[data-gizmo-icon="resize"]')).toHaveCount(6);

  await typeSelect.selectOption('courtyard');
  await expect(page.locator('[data-gizmo-icon="resize"]')).toHaveCount(8);
  await expect.poll(() => page.locator(
    '[data-gizmo-icon="resize"][data-control-id^="courtyard-"]:not([hidden])'
  ).count()).toBeGreaterThan(0);

  await dragResizeIcon(page, '[data-gizmo-icon="resize"][data-control-id^="outer-"]', 'farthest');
  await expect(page.getByRole('button', { name: '撤销' })).toBeEnabled();
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(typeSelect).toHaveValue('courtyard');
  await expect(page.locator('[data-gizmo-icon="resize"]')).toHaveCount(8);

  await dragResizeIcon(page, '[data-gizmo-icon="resize"][data-control-id^="courtyard-"]', 'nearest');
  await expect(page.getByRole('button', { name: '撤销' })).toBeEnabled();
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(typeSelect).toHaveValue('courtyard');
  await expect(page.locator('[data-gizmo-icon="resize"]')).toHaveCount(8);
});
