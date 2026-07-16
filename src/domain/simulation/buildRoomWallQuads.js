import { floorBaseY } from '../buildings/floorMath.js';
import { rotateLocalToWorld } from '../buildings/wallGeometry.js';
import { deriveWalls } from '../walls/deriveWalls.js';

export function buildRoomWallQuads(building) {
  const quads = [];
  for (let floor = 1; floor <= building.params.floors; floor += 1) {
    const baseY = floorBaseY({ floor, ...building.params });
    const topY = baseY + building.params.floorHeight;
    for (const wall of deriveWalls(building, floor)) {
      const [sx, sz] = rotateLocalToWorld(wall.start, building.rotation);
      const [ex, ez] = rotateLocalToWorld(wall.end, building.rotation);
      const ax = sx + building.position.x; const az = sz + building.position.z;
      const bx = ex + building.position.x; const bz = ez + building.position.z;
      quads.push({
        wallId: wall.id, buildingId: building.id, roomIds: wall.roomIds,
        a: [ax, baseY, az], b: [bx, baseY, bz], c: [bx, topY, bz], d: [ax, topY, az]
      });
    }
  }
  return quads;
}
