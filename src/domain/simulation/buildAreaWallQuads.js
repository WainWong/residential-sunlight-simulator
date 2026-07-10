import { rectUnionToPolygons } from '../buildings/rectUnion.js';
import { floorBaseY } from '../buildings/floorMath.js';
import { rotateLocalToWorld } from '../buildings/wallGeometry.js';

// The observation area's boundary walls are real room partitions — they block
// sunlight like any wall. Where the boundary coincides with an opening portal
// the hit is excused by the portal pass-through, so openings still admit light.
export function buildAreaWallQuads(building, area) {
  const baseY = floorBaseY({ floor: area.floor, ...building.params });
  const topY = baseY + building.params.floorHeight;
  const toWorld = ([lx, lz]) => {
    const [wx, wz] = rotateLocalToWorld([lx, lz], building.rotation);
    return [wx + building.position.x, wz + building.position.z];
  };
  const quads = [];
  for (const poly of rectUnionToPolygons(area.rects ?? [])) {
    for (const ring of [poly.outer, ...(poly.holes ?? [])]) {
      for (let e = 0; e < ring.length; e += 1) {
        const p = ring[e];
        const q = ring[(e + 1) % ring.length];
        const [ax, az] = toWorld([p.x, p.z]);
        const [bx, bz] = toWorld([q.x, q.z]);
        quads.push({
          wallId: `area-wall:${e}`,
          buildingId: building.id,
          a: [ax, baseY, az],
          b: [bx, baseY, bz],
          c: [bx, topY, bz],
          d: [ax, topY, az]
        });
      }
    }
  }
  return quads;
}
