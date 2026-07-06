import { resolveWallPlane } from '../buildings/wallGeometry.js';
import { floorBaseY } from '../buildings/floorMath.js';

export function buildOpeningPortals(building, openings) {
  const portals = [];
  for (const opening of openings) {
    const baseY = floorBaseY({ floor: opening.floor, ...building.params }) + (opening.sillHeight ?? 0);
    const resolved = resolveWallPlane(building, opening.wallId, {
      baseY, height: opening.height, width: opening.width
    });
    if (!resolved) continue;
    portals.push({
      id: opening.id,
      plane: { point: resolved.point, normal: resolved.normal, tangent: resolved.tangent },
      bounds: resolved.bounds
    });
  }
  return portals;
}
