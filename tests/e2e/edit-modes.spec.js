import { expect, test } from '@playwright/test';

test('room creation starts directly without hidden edit modes', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mobile is browse-only');
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await expect(page.getByTestId('building-context')).toBeVisible();
  await page.getByTestId('inspector-add-room-' + await page.locator('[data-testid^="building-tree-"]').getAttribute('data-testid').then(value => value.replace('building-tree-', ''))).click();
  await expect(page.getByTestId('room-session-title')).toHaveText('新建房间');
  // Tools are explicit (visible toolbar), not hidden modes; draw is default.
  await expect(page.getByTestId('room-tools')).toBeVisible();
  await expect(page.getByTestId('room-tool-draw')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('room-cancel').click();
  await expect(page.getByTestId('building-context')).toBeVisible();
});
