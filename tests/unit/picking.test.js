import { describe, expect, it } from 'vitest';
import { createBuildingMesh } from '../../src/scene/buildingMesh.js';
import { setBuildingFloorMode } from '../../src/scene/floorMode.js';
import { createObservationOverlay } from '../../src/scene/observationOverlay.js';
import { createOpeningOverlay } from '../../src/scene/openingOverlay.js';
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

  it('creates tagged observation, opening, and sun overlays', () => {
    const area = createObservationOverlay({
      cells: [[0, 0], [1, 0]],
      baseY: 6,
      litSampleIds: ['0:0:0']
    });
    const opening = createOpeningOverlay({
      id: 'window-a',
      width: 2,
      height: 1.5,
      center: [0, 7.5, -5],
      normal: [0, 0, -1]
    });
    const sun = createSunOverlay({ direction: [0.2, 0.8, -0.5] });

    expect(area.children).toHaveLength(2);
    expect(area.userData.kind).toBe('observation-overlay');
    expect(opening.userData.entityId).toBe('window-a');
    expect(sun.userData.kind).toBe('sun-overlay');
  });
});
