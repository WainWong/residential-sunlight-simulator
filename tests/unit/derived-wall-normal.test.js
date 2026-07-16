import { expect, it } from 'vitest';
import { deriveWalls } from '../../src/domain/walls/deriveWalls.js';

it('points exterior wall normals from the room toward outdoors', () => {
  const building = {
    id: 'b1', template: 'bar', position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 4, depth: 6, floors: 1, floorHeight: 3 },
    rooms: [{ id: 'r1', floor: 1, rects: [{ x0: -2, z0: -3, x1: 2, z1: 3 }] }]
  };
  const walls = deriveWalls(building, 1);
  const south = walls.find(wall => wall.start[1] === -3 && wall.end[1] === -3);
  const north = walls.find(wall => wall.start[1] === 3 && wall.end[1] === 3);
  expect(south.normal).toEqual([0, -1]);
  expect(north.normal).toEqual([0, 1]);
});
