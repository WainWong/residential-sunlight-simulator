import { expect, test } from '@playwright/test';

// Seed a project (a building with one observation area) directly into the
// localStorage draft so the test targets the interior-enter behaviour rather
// than the canvas drag-to-draw flow (which is exercised by area-topdown.spec).
const SEED = {
  schemaVersion: 1,
  id: 'seed-project',
  name: '室内测试项目',
  location: { cityId: 'shenzhen', latitude: 22.5431, longitude: 114.0579, timeZone: 'Asia/Shanghai' },
  buildings: [{
    id: 'b1',
    revision: 1,
    name: '住宅 1',
    template: 'bar',
    position: { x: 0, z: 0 },
    rotation: 0,
    params: { length: 60, depth: 18, floors: 6, floorHeight: 3 },
    // South edge (z=-9) lies on the footprint wall → the unified geometry cuts
    // a real opening there; the other three edges become interior partitions.
    observationAreas: [{ id: 'a1', floor: 2, rects: [{ x0: -8, z0: -9, x1: 8, z1: 0 }], sampleHeight: 0 }],
    openings: []
  }],
  simulation: { date: '2026-12-21', time: '09:30', activeAreaId: 'a1', sampleHeight: 0 },
  view: {
    camera: null, activePanel: 'buildings', wizardComplete: true, phase: 'edit',
    selectedBuildingId: 'b1', editorMode: 'none', addingBuildingId: null, areaEditing: null, interior: null
  }
};

test('enter an observation area interior in present phase', async ({ page }) => {
  await page.addInitScript(seed => {
    localStorage.setItem('residential-sunlight-simulator:draft:v1', JSON.stringify(seed));
  }, SEED);
  await page.goto('/');

  // The seeded area appears in the tree.
  await expect(page.getByTestId('area-tree-a1')).toBeVisible();

  // Switch to present phase — the enter button becomes visible.
  await page.getByTestId('phase-present').click();
  const enter = page.getByTestId('area-enter-a1');
  await expect(enter).toBeVisible();
  await expect(enter).toHaveText('进入');

  // Enter the interior — button reflects the entered state. The scene now
  // renders the room from the unified (CSG-cut) building geometry: the south
  // wall opening lets sunlight in, no separate room mesh / shadow ghost.
  await enter.click();
  await expect(enter).toHaveText('已进入');
  await expect(enter).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/interior-unified.png' });

  // Leaving the present phase exits the interior — the enter button resets.
  await page.getByTestId('phase-edit').click();
  await page.getByTestId('phase-present').click();
  await expect(page.getByTestId('area-enter-a1')).toHaveText('进入');
});
