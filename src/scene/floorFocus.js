import * as THREE from 'three';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { floorBaseY } from '../domain/buildings/floorMath.js';
import { applyBuildingTransform, getOuterRing } from './buildingSceneHelpers.js';

export function floorFocusTarget(building, floor) {
  const y = floorBaseY({ floor, ...building.params });
  return { target: { x: building.position.x, y, z: building.position.z } };
}

const slabMaterial = new THREE.MeshBasicMaterial({
  color: 0xdfe6e9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false
});

export function createFloorSlab(building, floor) {
  const footprint = createFootprint(building.template, building.params);
  const outer = getOuterRing(footprint);
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
  applyBuildingTransform(group, building);
  return group;
}

const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x4b6f78, transparent: true, opacity: 0.85 });

export function createWallOutline(building, floor) {
  const footprint = createFootprint(building.template, building.params);
  const outer = getOuterRing(footprint);
  const y = floorBaseY({ floor, ...building.params }) + building.params.floorHeight;
  const points = outer.map(([x, z]) => new THREE.Vector3(x, y, z));
  const group = new THREE.Group();
  group.name = 'wall-outline';
  group.userData.kind = 'wall-outline';
  group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), outlineMaterial));
  applyBuildingTransform(group, building);
  return group;
}
