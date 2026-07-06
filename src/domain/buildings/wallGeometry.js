import { createFootprint } from './createFootprint.js';
import { createWallSegments } from './createWallSegments.js';

const DEG = Math.PI / 180;

export function rotateLocalToWorld([x, z], rotationDeg) {
  const t = rotationDeg * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [x * c + z * s, -x * s + z * c];
}

export function worldWallSegments(building) {
  const footprint = createFootprint(building.template, building.params);
  const { x: px, z: pz } = building.position;
  return createWallSegments(footprint).map(wall => {
    const [sx, sz] = rotateLocalToWorld(wall.start, building.rotation);
    const [ex, ez] = rotateLocalToWorld(wall.end, building.rotation);
    const [nx, nz] = rotateLocalToWorld(wall.normal, building.rotation);
    return {
      id: wall.id,
      start: [sx + px, sz + pz],
      end: [ex + px, ez + pz],
      normal: [nx, nz],
      length: wall.length
    };
  });
}

const COMPASS = { south: [0, -1], north: [0, 1], east: [1, 0], west: [-1, 0] };

export function resolveWallId(building, wallRef) {
  const footprint = createFootprint(building.template, building.params);
  const walls = createWallSegments(footprint);
  if (walls.some(w => w.id === wallRef)) return wallRef;
  const dir = COMPASS[String(wallRef).split('-')[0]];
  if (!dir) return null;
  let best = null;
  let bestDot = -Infinity;
  for (const wall of walls) {
    const d = wall.normal[0] * dir[0] + wall.normal[1] * dir[1];
    if (d > bestDot) { bestDot = d; best = wall.id; }
  }
  return best;
}

export function resolveWallPlane(building, wallRef, { baseY, height, width }) {
  const id = resolveWallId(building, wallRef);
  if (id == null) return null;
  const wall = worldWallSegments(building).find(w => w.id === id);
  if (!wall) return null;
  const mid = [
    (wall.start[0] + wall.end[0]) / 2,
    (wall.start[1] + wall.end[1]) / 2
  ];
  const tx = (wall.end[0] - wall.start[0]) / wall.length;
  const tz = (wall.end[1] - wall.start[1]) / wall.length;
  return {
    point: [mid[0], baseY, mid[1]],
    normal: [wall.normal[0], 0, wall.normal[1]],
    tangent: [tx, 0, tz],
    bounds: { minU: -width / 2, maxU: width / 2, minV: baseY, maxV: baseY + height }
  };
}
