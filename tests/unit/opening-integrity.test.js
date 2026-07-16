import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import {
  createOpeningFromPreset,
  openingsOverlap,
  reprojectBuildingOpenings
} from '../../src/domain/openings/openingGeometry.js';
import { deriveWalls } from '../../src/domain/walls/deriveWalls.js';
import { createStore } from '../../src/store/createStore.js';
import {
  createReplaceRoomRectsCommand,
  createStartRoomEditCommand,
  createUpdateOpeningCommand
} from '../../src/store/roomCommands.js';

function buildingWithRoom() {
  return {
    id: 'b1', name: '住宅 1', template: 'bar', revision: 1,
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 10, depth: 8, floors: 1, floorHeight: 3 },
    rooms: [{
      id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
      rects: [{ x0: -5, z0: -4, x1: 5, z1: 4 }]
    }],
    openings: []
  };
}

function southWall(building) {
  return deriveWalls(building, 1).find(wall => wall.normal[1] === -1);
}

describe('opening integrity', () => {
  it('detects overlapping opening rectangles on the same wall', () => {
    const wall = southWall(buildingWithRoom());
    const first = createOpeningFromPreset({ wall, preset: 'window', centerU: 0.45, id: 'o1' });
    const second = createOpeningFromPreset({ wall, preset: 'window', centerU: 0.55, id: 'o2' });
    expect(openingsOverlap(first, second, wall)).toBe(true);
    expect(openingsOverlap(first, { ...second, bounds: { ...second.bounds, centerU: 0.85 } }, wall)).toBe(false);
  });

  it('reprojects an anchored opening when the corresponding wall changes length', () => {
    const building = buildingWithRoom();
    const originalWall = southWall(building);
    const opening = createOpeningFromPreset({ wall: originalWall, preset: 'window', centerU: 0.5, id: 'o1' });
    const resized = structuredClone(building);
    resized.rooms[0].rects = [{ x0: -4, z0: -4, x1: 4, z1: 4 }];
    resized.openings = [opening];

    const [projected] = reprojectBuildingOpenings(resized);
    expect(projected.status).toBe('valid');
    expect(projected.wallAnchor.wallId).not.toBe(originalWall.id);
    expect(projected.bounds.centerU).toBe(0.5);
  });

  it('rejects a room resize that would invalidate an existing opening', () => {
    const project = createDefaultProject();
    const building = buildingWithRoom();
    const wall = southWall(building);
    building.openings = [createOpeningFromPreset({ wall, preset: 'custom', centerU: 0.5, id: 'o1' })];
    building.openings[0].bounds.width = 6;
    project.buildings = [building];
    const store = createStore(project);
    store.execute(createStartRoomEditCommand('b1', 'r1'));

    expect(store.execute(createReplaceRoomRectsCommand([
      { x0: -2, z0: -4, x1: 2, z1: 4 }
    ]))).toBe(false);
    expect(store.getState().view.roomEditing.rects[0]).toMatchObject({ x0: -5, x1: 5 });
  });

  it('rejects an opening edit that overlaps another opening', () => {
    const project = createDefaultProject();
    const building = buildingWithRoom();
    const wall = southWall(building);
    building.openings = [
      createOpeningFromPreset({ wall, preset: 'window', centerU: 0.3, id: 'o1' }),
      createOpeningFromPreset({ wall, preset: 'window', centerU: 0.7, id: 'o2' })
    ];
    project.buildings = [building];
    const store = createStore(project);

    expect(store.execute(createUpdateOpeningCommand('b1', 'o2', {
      bounds: { centerU: 0.35 }
    }))).toBe(false);
    expect(store.getState().buildings[0].openings[1].bounds.centerU).toBe(0.7);
  });
});
