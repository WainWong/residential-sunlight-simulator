import { describe, expect, it } from 'vitest';
import { createFootprint } from '../../src/domain/buildings/createFootprint.js';
import { createWallSegments } from '../../src/domain/buildings/createWallSegments.js';
import { floorBaseY, totalBuildingHeight } from '../../src/domain/buildings/floorMath.js';

describe('building footprints', () => {
  it('creates a counter-clockwise bar footprint', () => {
    expect(createFootprint('bar', { length: 60, depth: 18 })).toEqual([
      [-30, -9],
      [30, -9],
      [30, 9],
      [-30, 9]
    ]);
  });

  it('creates an L-shaped six-corner footprint', () => {
    const footprint = createFootprint('lShape', {
      length: 60,
      depth: 40,
      wingLength: 18,
      wingDepth: 16
    });

    expect(footprint).toHaveLength(6);
    expect(footprint).toContainEqual([-12, 20]);
  });

  it('creates a courtyard outer ring plus clockwise hole', () => {
    const footprint = createFootprint('courtyard', {
      length: 60,
      depth: 40,
      courtyardLength: 30,
      courtyardDepth: 16
    });

    expect(footprint.outer).toHaveLength(4);
    expect(footprint.holes[0]).toEqual([
      [-15, -8],
      [-15, 8],
      [15, 8],
      [15, -8]
    ]);
  });

  it('generates stable wall ids and normalized outward normals', () => {
    const walls = createWallSegments(createFootprint('bar', { length: 60, depth: 18 }));

    expect(walls.map(wall => wall.id)).toEqual([
      'wall-outer-0', 'wall-outer-1', 'wall-outer-2', 'wall-outer-3'
    ]);
    expect(Math.hypot(...walls[0].normal)).toBeCloseTo(1, 8);
    expect(walls[0].normal).toEqual([0, -1]);
  });
});

describe('floor math', () => {
  it('supports a taller first floor', () => {
    const params = { floors: 3, floorHeight: 3, firstFloorHeight: 4.5 };

    expect(floorBaseY({ floor: 1, ...params })).toBe(0);
    expect(floorBaseY({ floor: 2, ...params })).toBe(4.5);
    expect(floorBaseY({ floor: 3, ...params })).toBe(7.5);
    expect(totalBuildingHeight(params)).toBe(10.5);
  });
});
