import * as THREE from 'three';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { floorBaseY } from '../domain/buildings/floorMath.js';

export function floorFocusTarget(building, floor) {
  const y = floorBaseY({ floor, ...building.params });
  const span = Math.max(building.params.length, building.params.depth);
  return { target: { x: building.position.x, y, z: building.position.z }, height: span * 1.2 + 60 };
}

export function floorVisibility(buildings, selectedBuildingId) {
  return buildingId => buildingId === selectedBuildingId;
}

const slabMaterial = new THREE.MeshBasicMaterial({
  color: 0xdfe6e9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false
});

export function createFloorSlab(building, floor) {
  const footprint = createFootprint(building.template, building.params);
  const outer = Array.isArray(footprint) ? footprint : footprint.outer;
  const shape = new THREE.Shape();
  outer.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  const y = floorBaseY({ floor, ...building.params });
  const group = new THREE.Group();
  group.name = 'floor-slab';
  group.userData.kind = 'floor-slab';
  const slab = new THREE.Mesh(new THREE.ShapeGeometry(shape), slabMaterial);
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = y + 0.01;
  group.add(slab);
  const xs = outer.map(p => p[0]);
  const zs = outer.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const size = Math.max(maxX - minX, maxZ - minZ);
  const grid = new THREE.GridHelper(Math.ceil(size), Math.ceil(size), 0x9fb0b6, 0xc3ced2);
  grid.position.set((minX + maxX) / 2, y + 0.012, (minZ + maxZ) / 2);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  group.add(grid);
  group.position.set(building.position.x, 0, building.position.z);
  group.rotation.y = THREE.MathUtils.degToRad(building.rotation);
  return group;
}
