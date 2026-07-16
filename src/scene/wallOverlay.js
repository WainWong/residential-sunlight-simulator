import * as THREE from 'three';
import { floorBaseY } from '../domain/buildings/floorMath.js';
import { rotateLocalToWorld } from '../domain/buildings/wallGeometry.js';
import { applyBuildingTransform } from './buildingSceneHelpers.js';

const hoverMaterial = new THREE.MeshBasicMaterial({
  color: 0x5b8f98, transparent: true, opacity: 0.2,
  depthTest: false, depthWrite: false, side: THREE.DoubleSide
});
const selectedMaterial = new THREE.MeshBasicMaterial({
  color: 0xe5a52d, transparent: true, opacity: 0.3,
  depthTest: false, depthWrite: false, side: THREE.DoubleSide
});
const markerMaterial = new THREE.MeshBasicMaterial({
  color: 0xe5a52d, depthTest: false, depthWrite: false
});

function wallCenter(wall, centerU = 0.5) {
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * centerU,
    wall.start[1] + (wall.end[1] - wall.start[1]) * centerU
  ];
}

export function wallCameraPose(building, wall) {
  const localCenter = wallCenter(wall);
  const [centerX, centerZ] = rotateLocalToWorld(localCenter, building.rotation);
  const [normalX, normalZ] = rotateLocalToWorld(wall.normal, building.rotation);
  const y = floorBaseY({ floor: wall.floor, ...building.params }) + building.params.floorHeight / 2;
  const distance = Math.max(6, Math.min(18, wall.length * 0.75));
  const target = { x: centerX + building.position.x, y, z: centerZ + building.position.z };
  return {
    target,
    position: {
      x: target.x + normalX * distance,
      y,
      z: target.z + normalZ * distance
    }
  };
}

export function createWallOverlay(building, wall, { centerU = 0.5, selected = false } = {}) {
  const group = new THREE.Group();
  group.name = `${selected ? 'selected' : 'hover'}-wall:${wall.id}`;
  group.userData.kind = 'wall-overlay';
  group.renderOrder = 30;
  applyBuildingTransform(group, building);

  const directionX = (wall.end[0] - wall.start[0]) / wall.length;
  const directionZ = (wall.end[1] - wall.start[1]) / wall.length;
  const center = wallCenter(wall);
  const baseY = floorBaseY({ floor: wall.floor, ...building.params });
  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(wall.length + 0.08, building.params.floorHeight + 0.06, 0.035),
    selected ? selectedMaterial : hoverMaterial
  );
  highlight.position.set(center[0], baseY + building.params.floorHeight / 2, center[1]);
  highlight.rotation.y = -Math.atan2(directionZ, directionX);
  highlight.userData.kind = selected ? 'wall-selected-highlight' : 'wall-hover-highlight';
  highlight.renderOrder = 30;
  group.add(highlight);

  if (selected) {
    const markerCenter = wallCenter(wall, centerU);
    const marker = new THREE.Group();
    marker.position.set(
      markerCenter[0] + wall.normal[0] * 0.09,
      baseY + Math.min(1.5, building.params.floorHeight / 2),
      markerCenter[1] + wall.normal[1] * 0.09
    );
    marker.rotation.y = -Math.atan2(directionZ, directionX);
    marker.userData.kind = 'wall-click-marker';
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.05), markerMaterial);
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.52, 0.05), markerMaterial);
    marker.add(horizontal, vertical);
    group.add(marker);
  }

  group.userData.dispose = () => group.traverse(child => child.geometry?.dispose());
  return group;
}
