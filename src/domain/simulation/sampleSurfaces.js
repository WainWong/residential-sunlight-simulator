import { rectsToSamplePoints } from './rectsToSamplePoints.js';
import { rectUnionToPolygons } from '../buildings/rectUnion.js';

const identity = p => p;

function floorSurface(area, spacing, transform) {
  const pts = rectsToSamplePoints(area.rects ?? [], spacing, area.sampleHeight ?? 0);
  // Normalize u,v over the rects' bounding box (not the sample-point extent,
  // which is inset by half a spacing) so texels align with the floor mesh UVs.
  const rxs = (area.rects ?? []).flatMap(r => [r.x0, r.x1]);
  const rzs = (area.rects ?? []).flatMap(r => [r.z0, r.z1]);
  const minX = Math.min(...rxs, 0), maxX = Math.max(...rxs, 1);
  const minZ = Math.min(...rzs, 0), maxZ = Math.max(...rzs, 1);
  const spanX = maxX - minX || 1, spanZ = maxZ - minZ || 1;
  return {
    surfaceId: 'floor',
    kind: 'floor',
    width: spanX,
    height: spanZ,
    spacing,
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
          spacing,
          samples
        });
      }
    });
  });
  return out;
}

export function sampleSurfaces(area, { floorHeight = 3, wallSpacing = 0.15, floorSpacing = 0.1 } = {}, transform = identity) {
  const baseY = area.sampleHeight ?? 0;
  const surfaces = [
    floorSurface(area, floorSpacing, transform),
    ...wallSurfaces(area, floorHeight, baseY, wallSpacing, transform)
  ];
  return { surfaces };
}
