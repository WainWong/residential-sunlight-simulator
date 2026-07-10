import * as THREE from 'three';
import { floorBaseY } from '../domain/buildings/floorMath.js';
import { rectUnionToPolygons } from '../domain/buildings/rectUnion.js';
import { applyBuildingTransform } from './buildingSceneHelpers.js';

// Bounding box of the area's rects — the shared normalization frame for both
// the floor mesh UVs and sampleSurfaces' floor u,v.
function areaBounds(rects) {
  const xs = rects.flatMap(r => [r.x0, r.x1]);
  const zs = rects.flatMap(r => [r.z0, r.z1]);
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1);
  const minZ = Math.min(...zs, 0), maxZ = Math.max(...zs, 1);
  return { minX, maxX, minZ, maxZ, spanX: (maxX - minX) || 1, spanZ: (maxZ - minZ) || 1 };
}

// Triangulate the area union polygons into a floor plane (shape space x,-z),
// then assign UVs from world x,z normalized over the area bbox.
function buildAreaFloorGeometry(polys, bbox) {
  const geom = new THREE.BufferGeometry();
  const pos = [];
  for (const poly of polys) {
    const shape = new THREE.Shape();
    poly.outer.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)));
    for (const hole of poly.holes) {
      const path = new THREE.Path();
      hole.forEach((p, i) => (i === 0 ? path.moveTo(p.x, -p.z) : path.lineTo(p.x, -p.z)));
      shape.holes.push(path);
    }
    const g = new THREE.ShapeGeometry(shape);
    const arr = g.getAttribute('position').array;
    const idx = g.index ? g.index.array : null;
    if (idx) for (const i of idx) pos.push(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
    else for (let i = 0; i < arr.length; i += 1) pos.push(arr[i]);
    g.dispose();
  }
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  // Shape space is (x, y=-z). Recover world x,z for UV normalization.
  const uv = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = -pos[i + 1];
    uv.push((x - bbox.minX) / bbox.spanX, (z - bbox.minZ) / bbox.spanZ);
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  return geom;
}

// Faces that receive a lightmap use a WHITE base so the texture shows at true
// color (MeshBasicMaterial multiplies map × color; a dark base would crush the
// lit patches to black). Faces without a lightmap (ceiling) pass their own color.
function faceMaterial(color = 0xffffff) {
  const m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
    // depthWrite off + explicit renderOrder (set per mesh) keeps the draw order
    // deterministic, so coincident/near-coplanar faces at openings don't flip
    // sort order each frame (the flicker).
    depthWrite: false
  });
  m.userData = { baseColor: new THREE.Color(color) };
  return m;
}

export function createInteriorFloor(building, floor, area) {
  const params = building.params;
  const baseY = floorBaseY({ floor, ...params });
  const topY = baseY + params.floorHeight;
  const group = new THREE.Group();
  group.name = 'interior-floor';
  group.userData.kind = 'interior-floor';

  // The interior room is the observation area itself (not the whole building
  // footprint), so its floor/walls align with the sampled lightmap.
  const polys = rectUnionToPolygons(area.rects ?? []);
  const bbox = areaBounds(area.rects ?? []);

  // Floor built from the area's union polygons, with UVs normalized over the
  // area bounding box — matching sampleSurfaces' floor u,v so the lightmap
  // texels land in the right place.
  const floorMesh = new THREE.Mesh(buildAreaFloorGeometry(polys, bbox), faceMaterial());
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = baseY + 0.01;
  floorMesh.renderOrder = 1;
  floorMesh.userData = { ...floorMesh.userData, surfaceId: 'floor', kind: 'floor' };
  group.add(floorMesh);

  // Ceiling: same shape at topY (no lightmap → keep a plain dim color).
  const ceiling = new THREE.Mesh(buildAreaFloorGeometry(polys, bbox), faceMaterial(0x2a343e));
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.y = topY;
  ceiling.renderOrder = 1;
  ceiling.userData = { ...ceiling.userData, kind: 'ceiling' };
  group.add(ceiling);

  // Interior walls from the observation-area union polygons.
  polys.forEach((poly, pi) => {
    const rings = [poly.outer, ...(poly.holes ?? [])];
    rings.forEach((ring, ri) => {
      for (let e = 0; e < ring.length; e += 1) {
        const a = ring[e];
        const b = ring[(e + 1) % ring.length];
        const geom = new THREE.BufferGeometry();
        const verts = new Float32Array([
          a.x, baseY, a.z, b.x, baseY, b.z, b.x, topY, b.z,
          a.x, baseY, a.z, b.x, topY, b.z, a.x, topY, a.z
        ]);
        geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
        const wall = new THREE.Mesh(geom, faceMaterial());
        wall.renderOrder = 2;
        wall.userData = { ...wall.userData, surfaceId: `wall:${pi}:${ri}:${e}`, kind: 'wall' };
        group.add(wall);
      }
    });
  });

  applyBuildingTransform(group, building);
  return group;
}
