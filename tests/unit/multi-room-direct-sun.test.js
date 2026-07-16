import { describe, expect, it } from 'vitest';
import { evaluateRoomDirectSun } from '../../src/domain/simulation/evaluateRoomDirectSun.js';
import { deriveWalls } from '../../src/domain/walls/deriveWalls.js';
import { createOpeningFromPreset } from '../../src/domain/openings/openingGeometry.js';

function projectWithPath() {
  const building = {
    id: 'b1', name: '住宅 1', template: 'bar', revision: 1,
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 4, depth: 10, floors: 1, floorHeight: 3 },
    rooms: [
      { id: 'south', floor: 1, name: '南侧房间', type: null, objects: [], rects: [{ x0: -1, z0: -5, x1: 1, z1: 0 }] },
      { id: 'target', floor: 1, name: '目标房间', type: null, objects: [], rects: [{ x0: -1, z0: 0, x1: 1, z1: 5 }] }
    ],
    openings: []
  };
  const walls = deriveWalls(building, 1);
  const shared = walls.find(wall => wall.kind === 'shared');
  const south = walls.find(wall => wall.kind === 'exterior' && wall.normal[1] < -0.9);
  building.openings.push(
    createOpeningFromPreset({ wall: shared, preset: 'doorway', centerU: 0.5, floorHeight: 3, id: 'door' }),
    createOpeningFromPreset({ wall: south, preset: 'window', centerU: 0.5, floorHeight: 3, id: 'window' })
  );
  building.openings[0].bounds = { centerU: 0.5, width: 2, bottom: 0, top: 3 };
  building.openings[1].bounds = { centerU: 0.5, width: 2, bottom: 0, top: 3 };
  return { buildings: [building] };
}

describe('multi-room direct sunlight', () => {
  it('passes through an exterior window and an interior doorway', () => {
    const project = projectWithPath();
    const result = evaluateRoomDirectSun({ project, activeRoomId: 'target', sunDirection: [0, 0.2, -1] });
    expect(result.hasDirectSun).toBe(true);
    expect(result.litRatio).toBeGreaterThan(0);
  });

  it('is blocked when the connecting doorway is missing', () => {
    const project = projectWithPath();
    project.buildings[0].openings = project.buildings[0].openings.filter(opening => opening.id !== 'door');
    expect(evaluateRoomDirectSun({ project, activeRoomId: 'target', sunDirection: [0, 0.2, -1] }).hasDirectSun).toBe(false);
  });
});
