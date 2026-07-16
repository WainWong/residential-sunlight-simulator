import { expect, test } from '@playwright/test';

test('all visible mobile buttons meet the touch target', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await page.goto('/');
  const controls = page.locator('button:visible');
  expect(await controls.count()).toBeGreaterThan(0);
  for (let index = 0; index < await controls.count(); index += 1) {
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

test('syncs a newly created building into the scene', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mobile is browse-only');
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '1');
});
