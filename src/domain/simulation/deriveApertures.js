import { createFootprint } from '../buildings/createFootprint.js';
import { createWallSegments } from '../buildings/createWallSegments.js';
import { floorBaseY } from '../buildings/floorMath.js';
import { rotateLocalToWorld } from '../buildings/wallGeometry.js';

const EPS = 1e-6;

export function deriveAperturesFromArea(building, area) {
  const walls = createWallSegments(createFootprint(building.template, building.params));
  const baseY = floorBaseY({ floor: area.floor, ...building.params });
  const height = building.params.floorHeight;
  const { x: px, z: pz } = building.position;
  const portals = [];
  const apertureWallIds = new Set();

  const toWorld = ([lx, lz]) => {
    const [wx, wz] = rotateLocalToWorld([lx, lz], building.rotation);
    return [wx + px, wz + pz];
  };

  for (const wall of walls) {
    const horizontal = Math.abs(wall.start[1] - wall.end[1]) < EPS; // z const → runs along x
    const fixed = horizontal ? wall.start[1] : wall.start[0];
    const wa = horizontal
      ? Math.min(wall.start[0], wall.end[0])
      : Math.min(wall.start[1], wall.end[1]);
    const wb = horizontal
      ? Math.max(wall.start[0], wall.end[0])
      : Math.max(wall.start[1], wall.end[1]);

    for (const rect of area.rects ?? []) {
      const perpMin = horizontal ? Math.min(rect.z0, rect.z1) : Math.min(rect.x0, rect.x1);
      const perpMax = horizontal ? Math.max(rect.z0, rect.z1) : Math.max(rect.x0, rect.x1);
      if (fixed < perpMin - EPS || fixed > perpMax + EPS) continue;
      const rMin = horizontal ? Math.min(rect.x0, rect.x1) : Math.min(rect.z0, rect.z1);
      const rMax = horizontal ? Math.max(rect.x0, rect.x1) : Math.max(rect.z0, rect.z1);
      const a = Math.max(wa, rMin);
      const b = Math.min(wb, rMax);
      if (b - a <= EPS) continue;

      const p0 = horizontal ? [a, fixed] : [fixed, a];
      const p1 = horizontal ? [b, fixed] : [fixed, b];
      const mid = horizontal ? [(a + b) / 2, fixed] : [fixed, (a + b) / 2];
      const w0 = toWorld(p0);
      const w1 = toWorld(p1);
      const wm = toWorld(mid);
      const dx = w1[0] - w0[0];
      const dz = w1[1] - w0[1];
      const len = Math.hypot(dx, dz);
      const [nx, nz] = rotateLocalToWorld(wall.normal, building.rotation);

      portals.push({
        id: `${wall.id}:${a.toFixed(3)}:${b.toFixed(3)}`,
        plane: {
          point: [wm[0], baseY, wm[1]],
          normal: [nx, 0, nz],
          tangent: [dx / len, 0, dz / len]
        },
        bounds: { minU: -len / 2, maxU: len / 2, minV: baseY, maxV: baseY + height }
      });
      apertureWallIds.add(`${building.id}:${wall.id}`);
    }
  }
  return { portals, apertureWallIds };
}
