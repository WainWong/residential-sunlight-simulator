import { describe, expect, it } from 'vitest';
import { intersectRayQuad, firstBlockingDistance } from '../../src/domain/simulation/intersectObstacles.js';
import { buildObstacles } from '../../src/domain/simulation/buildObstacles.js';

const wallQuad = {
  a: [-3, 0, -5], b: [3, 0, -5], c: [3, 20, -5], d: [-3, 20, -5]
};

describe('intersectRayQuad', () => {
  it('hits a wall quad straight ahead', () => {
    const d = intersectRayQuad([0, 1, 0], [0, 0, -1], wallQuad);
    expect(d).toBeCloseTo(5, 6);
  });
  it('misses when ray passes beside the quad', () => {
    expect(intersectRayQuad([10, 1, 0], [0, 0, -1], wallQuad)).toBeNull();
  });
});

describe('firstBlockingDistance mixed shapes', () => {
  it('still supports legacy AABB obstacles', () => {
    const d = firstBlockingDistance([0, 1, 0], [0, 0, -1],
      [{ id: 'x', min: [-3, 0, -20], max: [3, 20, -5] }]);
    expect(d).toBeCloseTo(5, 6);
  });
});

describe('buildObstacles', () => {
  const bar = {
    id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
    params: { length: 60, depth: 18, floors: 2, floorHeight: 3 }
  };
  it('emits four wall quads reaching building height', () => {
    const quads = buildObstacles([bar]);
    expect(quads).toHaveLength(4);
    const maxY = Math.max(...quads.flatMap(q => [q.a, q.b, q.c, q.d].map(p => p[1])));
    expect(maxY).toBeCloseTo(6, 6); // firstFloorHeight=floorHeight=3, floors=2 => 6
  });
  it('excludes named walls', () => {
    const quads = buildObstacles([bar], { excludeWallIds: new Set(['b1:wall-outer-0']) });
    expect(quads).toHaveLength(3);
  });
});
