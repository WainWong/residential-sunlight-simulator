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
