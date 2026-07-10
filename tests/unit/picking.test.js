import { describe, expect, it } from 'vitest';
import { createBuildingMesh } from '../../src/scene/buildingMesh.js';
import { setBuildingFloorMode } from '../../src/scene/floorMode.js';
import { createObservationOverlay } from '../../src/scene/observationOverlay.js';
import { pointerToNdc, resolvePickedEntity } from '../../src/scene/picking.js';
import { createSunOverlay } from '../../src/scene/sunOverlay.js';

const building = {
  id: 'building-a',
  revision: 1,
  template: 'bar',
  position: { x: 0, z: 0 },
  rotation: 0,
  params: { length: 20, depth: 10, floors: 5, floorHeight: 3 }
};

describe('scene picking', () => {
  it('walks to the nearest tagged parent', () => {
    const parent = { userData: { entityId: 'building-a' }, parent: null };
    const child = { userData: {}, parent };

    expect(resolvePickedEntity([{ object: child }])).toBe('building-a');
  });

  it('converts a pointer relative to the canvas', () => {
    const ndc = pointerToNdc(
      { clientX: 150, clientY: 75 },
      { left: 50, top: 25, width: 200, height: 100 }
    );

    expect(ndc).toEqual({ x: 0, y: 0 });
  });
});

describe('editing overlays', () => {
  it('adds and removes an active-floor band', () => {
    const group = createBuildingMesh(building);

    setBuildingFloorMode(group, { floor: 3, baseY: 6, height: 3 });
    expect(group.getObjectByName('active-floor')).toBeTruthy();
    expect(group.getObjectByName('active-floor').position.y).toBe(7.5);

    setBuildingFloorMode(group, null);
    expect(group.getObjectByName('active-floor')).toBeUndefined();
  });

  it('creates tagged observation and sun overlays', () => {
    const area = createObservationOverlay({
      rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }, { x0: 1, z0: 0, x1: 2, z1: 1 }],
      baseY: 6,
      lit: false
    });
    const sun = createSunOverlay({ direction: [0.2, 0.8, -0.5] });

    // The two adjacent rects merge into one polygonal shape (one mesh).
    expect(area.children).toHaveLength(1);
    expect(area.userData.kind).toBe('observation-overlay');
    expect(sun.userData.kind).toBe('sun-overlay');
  });

  it('marks a draft observation overlay', () => {
    const draftGroup = createObservationOverlay({
      rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }], baseY: 6, draft: true
    });
    expect(draftGroup.userData.draft).toBe(true);
    expect(draftGroup.children).toHaveLength(1);
  });
});
