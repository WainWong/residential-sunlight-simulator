import * as THREE from 'three';
import { formatWallDirection } from '../../domain/walls/wallDirection.js';

const GOLD = 0xe7a52d;
const UP = new THREE.Vector3(0, 1, 0);

export function rotationDirectionLabel(center, point) {
  return formatWallDirection([point.x - center.x, point.z - center.z]);
}

export function createBuildingRotationGuide() {
  const material = new THREE.MeshBasicMaterial({
    color: GOLD,
    depthTest: false,
    depthWrite: false
  });
  const group = new THREE.Group();
  group.name = 'building-rotation-guide';
  group.visible = false;
  group.renderOrder = 30;

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1, 12), material);
  shaft.name = 'building-rotation-guide-shaft';
  shaft.renderOrder = 30;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.15, 16), material);
  arrow.name = 'building-rotation-guide-arrow';
  arrow.renderOrder = 30;
  group.add(shaft, arrow);
  group.userData.dispose = () => {
    group.traverse(child => child.geometry?.dispose());
    material.dispose();
  };
  return group;
}

export function updateBuildingRotationGuide(group, center, point) {
  const start = new THREE.Vector3(center.x, 0.72, center.z);
  const direction = new THREE.Vector3(point.x - center.x, 0, point.z - center.z);
  const pointerDistance = direction.length();
  if (pointerDistance < 1e-6) {
    group.visible = false;
    return;
  }

  direction.normalize();
  const length = pointerDistance + 1.4;
  const end = start.clone().addScaledVector(direction, length);
  const shaft = group.getObjectByName('building-rotation-guide-shaft');
  const arrow = group.getObjectByName('building-rotation-guide-arrow');
  shaft.position.copy(start).add(end).multiplyScalar(0.5);
  shaft.scale.set(1, length, 1);
  shaft.quaternion.setFromUnitVectors(UP, direction);
  arrow.position.copy(end);
  arrow.quaternion.setFromUnitVectors(UP, direction);
  group.visible = true;
}
