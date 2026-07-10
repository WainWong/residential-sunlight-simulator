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
  applyBuildingTransform(group, building);
  return group;
}

