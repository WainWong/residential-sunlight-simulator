import { describe, expect, it } from 'vitest';
import { deriveWalls } from '../../src/domain/walls/deriveWalls.js';
import { formatWallDirection } from '../../src/domain/walls/wallDirection.js';

const building = {
  id: 'b1', template: 'bar', position: { x: 0, z: 0 }, rotation: 0,
  params: { length: 10, depth: 6, floors: 1, floorHeight: 3 },
  rooms: [
    { id: 'r1', floor: 1, rects: [{ x0: -5, z0: -3, x1: 0, z1: 3 }] },
    { id: 'r2', floor: 1, rects: [{ x0: 0, z0: -3, x1: 5, z1: 3 }] }
  ]
};

describe('derived walls', () => {
  it('derives exterior and shared walls without storing them', () => {
    const walls = deriveWalls(building, 1);
    expect(walls.filter(wall => wall.kind === 'exterior')).toHaveLength(6);
    expect(walls).toContainEqual(expect.objectContaining({
      kind: 'shared', roomIds: ['r1', 'r2'], start: [0, -3], end: [0, 3]
    }));
    expect(walls.every(wall => wall.id.startsWith('wall:1:'))).toBe(true);
  });

  it('derives a sealed wall when the other side is unmodelled interior space', () => {
    const oneRoom = { ...building, rooms: [building.rooms[0]] };
    expect(deriveWalls(oneRoom, 1)).toContainEqual(expect.objectContaining({ kind: 'sealed' }));
  });

  it('formats wall-facing normal as a compass direction and angle', () => {
    expect(formatWallDirection([-Math.SQRT1_2, -Math.SQRT1_2])).toBe('西南 225°');
    expect(formatWallDirection([0, 1])).toBe('正北 0°');
  });
});
