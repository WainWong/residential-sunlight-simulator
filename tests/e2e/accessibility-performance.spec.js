import { expect, test } from '@playwright/test';

test('all visible primary mobile controls meet the touch target', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile');
  await page.goto('/');
  await expect(page.getByRole('button', { name: '添加建筑' })).toBeVisible();
  const controls = page.locator('[data-primary-control]').filter({ visible: true });
  const count = await controls.count();

  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('shows a useful fallback when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(type, ...args) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return original.call(this, type, ...args);
    };
  });
  await page.goto('/');

  await expect(page.getByTestId('webgl-fallback')).toContainText('浏览器无法启动 3D 场景');
});

test('syncs a newly created building into the scene', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();

  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '1');
});
