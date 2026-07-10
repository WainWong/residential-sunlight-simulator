import { describe, expect, it } from 'vitest';
import { rectUnionToPolygons } from '../../src/domain/buildings/rectUnion.js';

const area = poly => Math.abs(poly.outer.reduce((s, p, i, arr) => {
  const q = arr[(i + 1) % arr.length];
  return s + p.x * q.z - q.x * p.z;
}, 0) / 2);

describe('rectUnionToPolygons', () => {
  it('returns one outer polygon for a single rect', () => {
    const polys = rectUnionToPolygons([{ x0: 0, z0: 0, x1: 2, z1: 3 }]);
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(0);
    expect(area(polys[0])).toBeCloseTo(6, 6);
  });

  it('merges two adjacent rects into one polygon (L-shape, no seam)', () => {
    const polys = rectUnionToPolygons([
      { x0: 0, z0: 0, x1: 2, z1: 2 },
      { x0: 2, z0: 0, x1: 4, z1: 1 }
    ]);
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(0);
    // L-shape area = 2*2 + 2*1 = 6
    expect(area(polys[0])).toBeCloseTo(6, 6);
  });

  it('keeps disjoint rects as separate polygons', () => {
    const polys = rectUnionToPolygons([
      { x0: 0, z0: 0, x1: 1, z1: 1 },
      { x0: 5, z0: 5, x1: 6, z1: 6 }
    ]);
    expect(polys).toHaveLength(2);
  });

  it('produces a hole for a rect ring', () => {
    // Outer 0..4, with a 1..3 hole (drawn as a frame).
    const polys = rectUnionToPolygons([
      { x0: 0, z0: 0, x1: 4, z1: 1 },
      { x0: 0, z0: 3, x1: 4, z1: 4 },
      { x0: 0, z0: 1, x1: 1, z1: 3 },
      { x0: 3, z0: 1, x1: 4, z1: 3 }
    ]);
    expect(polys).toHaveLength(1);
    expect(polys[0].holes).toHaveLength(1);
    // Outer area 16, hole area 4 -> filled area 12
    expect(area(polys[0])).toBeCloseTo(16, 6);
  });
});
