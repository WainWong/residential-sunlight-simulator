import * as THREE from 'three';

export function getOuterRing(footprint) {
  return Array.isArray(footprint) ? footprint : footprint.outer;
}

export function applyBuildingTransform(group, building) {
  group.position.set(building.position.x, 0, building.position.z);
  group.rotation.y = THREE.MathUtils.degToRad(building.rotation);
}
