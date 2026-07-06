import { worldWallSegments } from '../buildings/wallGeometry.js';
import { totalBuildingHeight } from '../buildings/floorMath.js';

export function buildObstacles(buildings, { excludeWallIds = new Set() } = {}) {
  const quads = [];
  for (const building of buildings) {
    const height = totalBuildingHeight(building.params);
    for (const wall of worldWallSegments(building)) {
      if (excludeWallIds.has(`${building.id}:${wall.id}`)) continue;
      const [sx, sz] = wall.start;
      const [ex, ez] = wall.end;
      quads.push({
        wallId: wall.id,
        buildingId: building.id,
        a: [sx, 0, sz],
        b: [ex, 0, ez],
        c: [ex, height, ez],
        d: [sx, height, sz]
      });
    }
  }
  return quads;
}
