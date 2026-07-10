import { rectsToSamplePoints } from './rectsToSamplePoints.js';
import { rectUnionToPolygons } from '../buildings/rectUnion.js';

const identity = p => p;

function floorSurface(area, spacing, transform) {
  const pts = rectsToSamplePoints(area.rects ?? [], spacing, area.sampleHeight ?? 0);
  const xs = pts.map(p => p.position[0]);
  const zs = pts.map(p => p.position[2]);
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1);
  const minZ = Math.min(...zs, 0), maxZ = Math.max(...zs, 1);
  const spanX = maxX - minX || 1, spanZ = maxZ - minZ || 1;
  return {
    surfaceId: 'floor',
    kind: 'floor',
    width: spanX,
    height: spanZ,
    samples: pts.map(p => ({
      id: `floor:${p.id}`,
      position: transform(p.position),
      u: (p.position[0] - minX) / spanX,
      v: (p.position[2] - minZ) / spanZ
    }))
  };
}

function wallSurfaces(area, floorHeight, baseY, spacing, transform) {
  const polys = rectUnionToPolygons(area.rects ?? []);
  const out = [];
  polys.forEach((poly, pi) => {
    const rings = [poly.outer, ...(poly.holes ?? [])];
    rings.forEach((ring, ri) => {
      for (let e = 0; e < ring.length; e += 1) {
        const { x: ax, z: az } = ring[e];
        const { x: bx, z: bz } = ring[(e + 1) % ring.length];
        const len = Math.hypot(bx - ax, bz - az);
        if (len === 0) continue;
        const samples = [];
        const nH = Math.max(1, Math.round(len / spacing));
        const nV = Math.max(1, Math.round(floorHeight / spacing));
        for (let i = 0; i < nH; i += 1) {
          const fu = (i + 0.5) / nH;
          const x = ax + (bx - ax) * fu;
          const z = az + (bz - az) * fu;
          for (let j = 0; j < nV; j += 1) {
            const fv = (j + 0.5) / nV;
            const y = baseY + floorHeight * fv;
            samples.push({
              id: `wall:${pi}:${ri}:${e}:${i}:${j}`,
              position: transform([x, y, z]),
              u: fu,
              v: fv
            });
          }
        }
        out.push({
          surfaceId: `wall:${pi}:${ri}:${e}`,
          kind: 'wall',
          width: len,
          height: floorHeight,
          samples
        });
      }
    });
  });
  return out;
}

export function sampleSurfaces(area, { floorHeight = 3, wallSpacing = 1, floorSpacing = 1 } = {}, transform = identity) {
  const baseY = area.sampleHeight ?? 0;
  const surfaces = [
    floorSurface(area, floorSpacing, transform),
    ...wallSurfaces(area, floorHeight, baseY, wallSpacing, transform)
  ];
  return { surfaces };
}
