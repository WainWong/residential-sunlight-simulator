import { describe, expect, it } from 'vitest';
import { buildAreaWallQuads } from '../../src/domain/simulation/buildAreaWallQuads.js';
import { evaluateInteriorSun } from '../../src/domain/simulation/evaluateInteriorSun.js';

const building = {
  id: 'b1', template: 'bar', position: { x: 0, z: 0 }, rotation: 0,
  params: { length: 60, depth: 18, floors: 5, floorHeight: 3 }
};

// L-shaped room: south strip x0..8,z0..4 + north-west lobe x0..4,z4..8.
// Opening on the EAST edge of the south strip (x=8, z 0..4, full height).
const area = {
  floor: 1,
  rects: [
    { x0: 0, z0: 0, x1: 8, z1: 4 },
    { x0: 0, z0: 4, x1: 4, z1: 8 }
  ]
};
const opening = {
  plane: { point: [8, 0, 2], normal: [1, 0, 0], tangent: [0, 0, 1] },
  bounds: { minU: -2, maxU: 2, minV: 0, maxV: 3 }
};
// Sun to the east, low: direction from sample toward sun.
const sunDirection = [1, 0.3, -0.5];

describe('buildAreaWallQuads', () => {
  it('builds one full-height quad per boundary edge', () => {
    const quads = buildAreaWallQuads(building, { floor: 1, rects: [{ x0: 0, z0: 0, x1: 4, z1: 4 }] });
    expect(quads).toHaveLength(4);
    for (const q of quads) {
      expect(q.a[1]).toBe(0); // floor 1 baseY
      expect(q.c[1]).toBe(3); // topY = baseY + floorHeight
    }
  });

  it('lets light through the opening but blocks it behind the partition', () => {
    const quads = buildAreaWallQuads(building, area);
    const surfaces = [{
      surfaceId: 'floor',
      kind: 'floor',
      samples: [
        // South strip, clear line to the opening → lit (boundary hit at the
        // opening is excused by the portal pass-through).
        { id: 'open', position: [6, 0, 2] },
        // North-west lobe: its ray to the sun crosses the lobe's east
        // boundary wall (x=4, z4..8) before reaching the opening → dark.
        { id: 'hidden', position: [2, 0, 6] }
      ]
    }];

    // Sanity: WITHOUT partition quads the hidden sample would be lit — the
    // ray does reach the opening geometrically.
    const noWalls = evaluateInteriorSun({ surfaces, openings: [opening], obstacles: [], sunDirection });
    expect(noWalls.masks.floor).toContain('hidden');

    // WITH the area walls as obstacles, the partition blocks it.
    const withWalls = evaluateInteriorSun({ surfaces, openings: [opening], obstacles: quads, sunDirection });
    expect(withWalls.masks.floor).toContain('open');
    expect(withWalls.masks.floor).not.toContain('hidden');
  });
});
