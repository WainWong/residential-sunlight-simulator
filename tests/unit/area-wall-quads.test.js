import { describe, expect, it } from 'vitest';
import { buildAreaWallQuads } from '../../src/domain/simulation/buildAreaWallQuads.js';
import { firstBlockingDistance } from '../../src/domain/simulation/intersectObstacles.js';
import { intersectOpening } from '../../src/domain/simulation/intersectOpening.js';
import { normalize } from '../../src/domain/simulation/vector.js';

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
// Direction from sample toward a low eastern sun.
const sunDirection = normalize([1, 0.3, -0.5]);

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

    // South strip sample: its ray exits through the opening; the boundary
    // wall hit lands inside the portal bounds and is excused → clear.
    const open = [6, 0, 2];
    expect(intersectOpening(open, sunDirection, opening)).not.toBeNull();
    expect(firstBlockingDistance(open, sunDirection, quads, [opening])).toBeNull();

    // North-west lobe sample: geometrically the ray still reaches the
    // opening, but it first crosses the lobe's east boundary wall (x=4,
    // z4..8) — a partition, not an opening → blocked.
    const hidden = [2, 0, 6];
    expect(intersectOpening(hidden, sunDirection, opening)).not.toBeNull();
    expect(firstBlockingDistance(hidden, sunDirection, quads, [opening])).not.toBeNull();
  });
});
