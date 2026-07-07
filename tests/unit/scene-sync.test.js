import { describe, expect, it, vi } from 'vitest';
import { createBuildingMesh } from '../../src/scene/buildingMesh.js';
import { createSceneSynchronizer } from '../../src/scene/syncScene.js';

describe('selection highlight', () => {
  const barBuilding = {
    id: 'building-a', revision: 1, template: 'bar',
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 60, depth: 18, floors: 3, floorHeight: 3 }
  };

  it('rebuilds with highlight material when selected but not editing', () => {
    const group = createBuildingMesh(barBuilding, { highlighted: true });
    const solid = group.children.find(c => c.userData.kind === 'building-solid');
    expect(group.userData.highlighted).toBe(true);
    expect(solid.material.emissiveIntensity).toBeGreaterThan(0);
  });

  it('preview takes precedence over highlight', () => {
    const group = createBuildingMesh(barBuilding, { preview: true, highlighted: true });
    expect(group.userData.preview).toBe(true);
    expect(group.userData.highlighted).toBe(false);
  });

  it('signature includes highlight so highlight toggles rebuild', () => {
    const rebuild = vi.fn((b, opts) => ({ id: b.id, opts, dispose: vi.fn() }));
    const sync = createSceneSynchronizer({ rebuild, attach: vi.fn(), detach: vi.fn() });
    sync.update([barBuilding], { previewBuildingId: null, highlightBuildingId: null });
    sync.update([barBuilding], { previewBuildingId: null, highlightBuildingId: 'building-a' });
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(rebuild.mock.calls[1][1]).toEqual({ preview: false, highlighted: true });
  });
});

const barBuilding = {
  id: 'building-a',
  revision: 1,
  template: 'bar',
  position: { x: 4, z: -6 },
  rotation: 30,
  params: {
    length: 60,
    depth: 18,
    floors: 3,
    floorHeight: 3,
    firstFloorHeight: 4.5
  }
};

describe('building scene mesh', () => {
  it('creates a tagged group at the building transform', () => {
    const group = createBuildingMesh(barBuilding);

    expect(group.userData.entityId).toBe('building-a');
    expect(group.position.toArray()).toEqual([4, 0, -6]);
    expect(group.rotation.y).toBeCloseTo(Math.PI / 6);
    expect(group.userData.totalHeight).toBe(10.5);
    expect(group.children.some(child => child.userData.kind === 'building-solid')).toBe(true);
  });
});

describe('scene synchronization', () => {
  it('rebuilds only changed buildings and removes deleted ones', () => {
    const rebuild = vi.fn(building => ({ id: building.id, dispose: vi.fn() }));
    const attach = vi.fn();
    const detach = vi.fn();
    const sync = createSceneSynchronizer({ rebuild, attach, detach });

    sync.update([{ id: 'a', revision: 1 }, { id: 'b', revision: 1 }]);
    sync.update([{ id: 'a', revision: 2 }]);

    expect(rebuild).toHaveBeenCalledTimes(3);
    expect(rebuild.mock.calls.at(-1)[0].id).toBe('a');
    expect(detach).toHaveBeenCalledTimes(2);
  });

  it('uses a translucent blueprint material while editing', () => {
    const group = createBuildingMesh(barBuilding, { preview: true });
    const solid = group.children.find(child => child.userData.kind === 'building-solid');

    expect(solid.material.transparent).toBe(true);
    expect(solid.material.opacity).toBeLessThan(1);
    expect(group.userData.preview).toBe(true);
  });

  it('rebuilds when preview state changes without a revision change', () => {
    const rebuild = vi.fn((building, options) => ({ building, options }));
    const sync = createSceneSynchronizer({
      rebuild,
      attach: vi.fn(),
      detach: vi.fn()
    });

    sync.update([barBuilding], { previewBuildingId: null });
    sync.update([barBuilding], { previewBuildingId: 'building-a' });

    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(rebuild.mock.calls[1][1]).toEqual({ preview: true, highlighted: false });
  });
});
