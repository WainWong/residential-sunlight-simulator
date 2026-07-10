import * as THREE from 'three';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { floorBaseY } from '../domain/buildings/floorMath.js';
import { rectUnionToPolygons } from '../domain/buildings/rectUnion.js';
import { applyBuildingTransform, getOuterRing } from './buildingSceneHelpers.js';

function faceMaterial(color) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
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

  // Floor slab from footprint outer ring.
  const footprint = createFootprint(building.template, params);
  const outer = getOuterRing(footprint);
  const shape = new THREE.Shape();
  outer.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  const floorMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), faceMaterial(0x2b3540));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = baseY + 0.01;
  floorMesh.userData = { ...floorMesh.userData, surfaceId: 'floor', kind: 'floor' };
  group.add(floorMesh);

  // Ceiling: same shape at topY.
  const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(shape), faceMaterial(0x222c36));
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.y = topY;
  ceiling.userData = { ...ceiling.userData, kind: 'ceiling' };
  group.add(ceiling);

  // Interior walls from the observation-area union polygons.
  const polys = rectUnionToPolygons(area.rects ?? []);
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
        const wall = new THREE.Mesh(geom, faceMaterial(0x33404d));
        wall.userData = { ...wall.userData, surfaceId: `wall:${pi}:${ri}:${e}`, kind: 'wall' };
        group.add(wall);
      }
    });
  });

  applyBuildingTransform(group, building);
  return group;
}
