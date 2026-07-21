import { describe, expect, it } from 'vitest';
import { intersectRayQuad, intersectRayCap, firstBlockingDistance } from '../../src/domain/simulation/intersectObstacles.js';
import { buildObstacles } from '../../src/domain/simulation/buildObstacles.js';
import { buildHorizontalCaps } from '../../src/domain/simulation/buildHorizontalCaps.js';

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

  it('builds a horizontal cap at every floor boundary plus the roof', () => {
    const caps = buildHorizontalCaps([bar]); // floors=2, fh=3 → levels {0, 3, 6}
    expect(caps.map(c => c.y).sort((a, b) => a - b)).toEqual([0, 3, 6]);
    expect(caps.every(c => c.cap === true && c.buildingId === 'b1')).toBe(true);
    // bar footprint x∈[-30,30], z∈[-9,9]; ring is the solid outer, no holes
    expect(caps[0].rings).toHaveLength(1);
  });
});

describe('intersectRayCap', () => {
  const cap = { cap: true, y: 3, rings: [[[-10, -10], [10, -10], [10, 10], [-10, 10]]] };
  it('hits a horizontal cap from below', () => {
    const d = intersectRayCap([0, 0, 0], [0, 1, 0], cap);
    expect(d).toBeCloseTo(3, 6);
  });
  it('misses when the crossing point is outside the ring', () => {
    expect(intersectRayCap([0, 0, 0], [1, 0.001, 0], cap)).toBeNull();
  });
  it('lets the ray pass through a hole (courtyard void)', () => {
    const holed = { cap: true, y: 3, rings: [[[-10, -10], [10, -10], [10, 10], [-10, 10]], [[-5, -5], [5, -5], [5, 5], [-5, 5]]] };
    expect(intersectRayCap([0, 0, 0], [0, 1, 0], holed)).toBeNull(); // straight up lands in the hole
    expect(intersectRayCap([8, 0, 8], [0, 1, 0], holed)).toBeCloseTo(3, 6); // outside the hole → blocked
  });
  it('ignores a cap the ray runs parallel to', () => {
    expect(intersectRayCap([0, 0, 0], [1, 0, 0], cap)).toBeNull();
  });
});
