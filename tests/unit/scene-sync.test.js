import { describe, expect, it, vi } from 'vitest';
import { createBuildingMesh } from '../../src/scene/buildingMesh.js';
import { createSceneSynchronizer } from '../../src/scene/syncScene.js';

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
});
