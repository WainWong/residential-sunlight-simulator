import { describe, expect, it } from 'vitest';
import { clipRectToFootprint } from '../../src/domain/buildings/footprintClip.js';

const norm = r => ({ x0: Math.min(r.x0, r.x1), z0: Math.min(r.z0, r.z1), x1: Math.max(r.x0, r.x1), z1: Math.max(r.z0, r.z1) });

describe('clipRectToFootprint', () => {
  it('clamps a rect overhanging a bar footprint to the slab bounds', () => {
    const params = { length: 60, depth: 18 }; // local x in [-30,30], z in [-9,9]
    const pieces = clipRectToFootprint({ x0: -100, z0: -100, x1: 100, z1: 100 }, 'bar', params)
      .map(norm);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toEqual({ x0: -30, z0: -9, x1: 30, z1: 9 });
  });

  it('returns nothing when the rect is entirely outside the slab', () => {
    const params = { length: 60, depth: 18 };
    const pieces = clipRectToFootprint({ x0: 40, z0: 40, x1: 50, z1: 50 }, 'bar', params);
    expect(pieces).toEqual([]);
  });

  it('clips to the L-shape footprint, dropping the missing corner', () => {
    // lShape: full bbox x[-30,30] z[-9,9], missing corner x[0,30] z[0,9] (wingLength=30, wingDepth=9)
    const params = { length: 60, depth: 18, wingLength: 30, wingDepth: 9 };
    const pieces = clipRectToFootprint({ x0: -30, z0: -9, x1: 30, z1: 9 }, 'lShape', params)
      .map(norm)
      .sort((a, b) => (a.z0 - b.z0) || (a.x0 - b.x0));
    // Expect the L: bottom strip (full x, z[-9,0]) + left strip (x[-30,0], z[0,9]).
    expect(pieces).toHaveLength(2);
    expect(pieces.some(p => p.x0 === -30 && p.x1 === 30 && p.z0 === -9 && p.z1 === 0)).toBe(true);
    expect(pieces.some(p => p.x0 === -30 && p.x1 === 0 && p.z0 === 0 && p.z1 === 9)).toBe(true);
  });

  it('clips across a courtyard hole, splitting into two pieces', () => {
    // courtyard: outer x[-30,30] z[-9,9], hole x[-15,15] z[-8,8]
    const params = { length: 60, depth: 18, courtyardLength: 30, courtyardDepth: 16 };
    const pieces = clipRectToFootprint({ x0: -30, z0: -9, x1: 30, z1: 9 }, 'courtyard', params)
      .map(norm);
    // The hole splits the rect into top + bottom strips (and the hole is removed).
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    // No piece overlaps the hole.
    for (const p of pieces) {
      const overlapsHole = p.x0 < 15 && p.x1 > -15 && p.z0 < 8 && p.z1 > -8;
      expect(overlapsHole).toBe(false);
    }
  });
});
