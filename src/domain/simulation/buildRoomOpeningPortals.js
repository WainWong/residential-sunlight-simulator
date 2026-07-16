import { floorBaseY } from '../buildings/floorMath.js';
import { rotateLocalToWorld } from '../buildings/wallGeometry.js';
import { deriveWalls } from '../walls/deriveWalls.js';

export function buildRoomOpeningPortals(building) {
  const portals = [];
  for (const opening of building.openings ?? []) {
    if (opening.status === 'invalid') continue;
    const wall = deriveWalls(building, opening.floor).find(candidate => candidate.id === opening.wallAnchor?.wallId);
    if (!wall) continue;
    const bounds = opening.bounds;
    if (!(bounds?.width > 0 && bounds.top > bounds.bottom)) continue;
    const tx = (wall.end[0] - wall.start[0]) / wall.length;
    const tz = (wall.end[1] - wall.start[1]) / wall.length;
    const distance = bounds.centerU * wall.length;
    const localPoint = [wall.start[0] + tx * distance, wall.start[1] + tz * distance];
    const [px, pz] = rotateLocalToWorld(localPoint, building.rotation);
    const [tnx, tnz] = rotateLocalToWorld([tx, tz], building.rotation);
    const [nx, nz] = rotateLocalToWorld(wall.normal, building.rotation);
    const baseY = floorBaseY({ floor: opening.floor, ...building.params });
    portals.push({
      id: opening.id,
      fill: opening.fill,
      connectedRoomIds: opening.connectedRoomIds,
      plane: {
        point: [px + building.position.x, baseY, pz + building.position.z],
        normal: [nx, 0, nz],
        tangent: [tnx, 0, tnz]
      },
      bounds: {
        minU: -bounds.width / 2,
        maxU: bounds.width / 2,
        minV: baseY + bounds.bottom,
        maxV: baseY + bounds.top
      }
    });
  }
  return portals;
}
