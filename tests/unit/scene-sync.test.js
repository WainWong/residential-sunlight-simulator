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
    const solid = group.children.find(c => c.userData.kind === 'building-segment');
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
    sync.update([barBuilding], { highlightBuildingId: null });
    sync.update([barBuilding], { highlightBuildingId: 'building-a' });
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(rebuild.mock.calls[1][1]).toEqual({ preview: false, highlighted: true });
  });

  it('carves the draft: signature tracks draft rects and rebuild gets an augmented room', () => {
    const rebuild = vi.fn((b, opts) => ({ id: b.id, rooms: b.rooms, opts, dispose: vi.fn() }));
    const sync = createSceneSynchronizer({ rebuild, attach: vi.fn(), detach: vi.fn() });
    const draft = { buildingId: 'building-a', roomId: 'draft-1', floor: 1, rects: [{ x0: 0, z0: 0, x1: 4, z1: 4 }] };
    sync.update([barBuilding], { draft });
    // draft room appended for the carve
    expect(rebuild.mock.calls[0][0].rooms).toEqual([{ id: 'draft-1', floor: 1, rects: draft.rects, objects: [] }]);
    // same draft → no rebuild
    sync.update([barBuilding], { draft });
    expect(rebuild).toHaveBeenCalledTimes(1);
    // draft rects change → rebuild
    sync.update([barBuilding], { draft: { ...draft, rects: [{ x0: 0, z0: 0, x1: 6, z1: 4 }] } });
    expect(rebuild).toHaveBeenCalledTimes(2);
    // draft cleared → rebuild back to canonical (no draft room)
    sync.update([barBuilding], { draft: null });
    expect(rebuild).toHaveBeenCalledTimes(3);
    expect(rebuild.mock.calls[2][0].rooms ?? []).toEqual([]);
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
    expect(group.children.some(child => child.userData.kind === 'building-segment')).toBe(true);
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
    const solid = group.children.find(child => child.userData.kind === 'building-segment');

    expect(solid.material.transparent).toBe(true);
    expect(solid.material.opacity).toBeLessThan(1);
    expect(group.userData.preview).toBe(true);
  });

});

  it('shows and clears one transient building without replacing canonical state', () => {
    const rebuild = vi.fn((building, options) => ({
      building,
      options,
      visible: true,
      userData: { preview: options.preview, dispose: vi.fn() }
    }));
    const attach = vi.fn();
    const detach = vi.fn();
    const sync = createSceneSynchronizer({ rebuild, attach, detach });
    sync.update([barBuilding]);
    const canonical = attach.mock.calls[0][0];

    sync.showTransient({
      ...barBuilding,
      params: { ...barBuilding.params, length: 72 }
    });
    const transient = attach.mock.calls[1][0];

    expect(canonical.visible).toBe(false);
    expect(transient.options).toEqual({ preview: true, highlighted: false });
    expect(transient.building.params.length).toBe(72);

    sync.clearTransient();

    expect(canonical.visible).toBe(true);
    expect(detach).toHaveBeenCalledWith(transient);
    expect(transient.userData.dispose).toHaveBeenCalledOnce();
  });

  it('disposes a previous transient before replacing it', () => {
    const rebuild = vi.fn((building, options) => ({
      building,
      options,
      visible: true,
      userData: { dispose: vi.fn() }
    }));
    const attach = vi.fn();
    const detach = vi.fn();
    const sync = createSceneSynchronizer({ rebuild, attach, detach });
    sync.update([barBuilding]);

    sync.showTransient({ ...barBuilding, params: { ...barBuilding.params, length: 70 } });
    const first = attach.mock.calls[1][0];
    sync.showTransient({ ...barBuilding, params: { ...barBuilding.params, length: 80 } });
    const second = attach.mock.calls[2][0];

    expect(detach).toHaveBeenCalledWith(first);
    expect(first.userData.dispose).toHaveBeenCalledOnce();
    expect(second.building.params.length).toBe(80);
    sync.dispose();
    expect(second.userData.dispose).toHaveBeenCalledOnce();
  });
