import { createFootprint } from '../buildings/createFootprint.js';
import { floorBaseY, totalBuildingHeight } from '../buildings/floorMath.js';
import { rotateLocalToWorld } from '../buildings/wallGeometry.js';

// Horizontal occluders: one footprint-shaped slab at every floor boundary
// (y = 0, floor 2 base, …) plus the roof. These make each room a closed box —
// a ray only escapes through a wall opening, never straight up through a
// missing ceiling or down through a missing floor. Courtyard holes are real
// gaps (the ray passes through them), so holes are honoured by the point test.
//
// Each cap is { y, rings: [outerWorld, ...holesWorld], buildingId }. A ray hits
// a cap when it crosses y=cap.y at an XZ inside the outer ring and outside every
// hole ring. Self-hits at the sample's own floor are excused by the caller's
// EPSILON start-distance, same as any coincident-plane obstacle.
export function buildHorizontalCaps(buildings) {
  const caps = [];
  for (const building of buildings) {
    const footprint = createFootprint(building.template, building.params);
    const { x: px, z: pz } = building.position;
    const toWorld = ring => ring.map(([x, z]) => {
      const [wx, wz] = rotateLocalToWorld([x, z], building.rotation);
      return [wx + px, wz + pz];
    });
    const outer = toWorld(Array.isArray(footprint) ? footprint : footprint.outer);
    const holes = (Array.isArray(footprint) ? [] : footprint.holes ?? []).map(toWorld);
    const rings = [outer, ...holes];

    const levels = new Set([0, totalBuildingHeight(building.params)]);
    for (let floor = 1; floor <= building.params.floors; floor += 1) {
      levels.add(floorBaseY({ floor, ...building.params }));
    }
    for (const y of levels) {
      caps.push({ cap: true, y, rings, buildingId: building.id });
    }
  }
  return caps;
}
