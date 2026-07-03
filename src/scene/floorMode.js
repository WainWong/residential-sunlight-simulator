import * as THREE from 'three';

function removeActiveFloor(group) {
  const activeFloor = group.getObjectByName('active-floor');
  if (!activeFloor) return;
  group.remove(activeFloor);
  activeFloor.geometry.dispose();
  activeFloor.material.dispose();
}

export function setBuildingFloorMode(group, selection) {
  removeActiveFloor(group);
  const solid = group.children.find(child => child.userData.kind === 'building-solid');
  if (!solid) return;

  if (!solid.userData.floorModeMaterial) {
    solid.material = solid.material.clone();
    solid.userData.floorModeMaterial = true;
  }
  solid.material.transparent = Boolean(selection);
  solid.material.opacity = selection ? 0.18 : 1;
  solid.material.depthWrite = !selection;
  solid.material.needsUpdate = true;
  if (!selection) return;

  solid.geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  solid.geometry.boundingBox.getSize(size);
  const geometry = new THREE.BoxGeometry(size.x, selection.height - 0.08, size.z);
  const material = new THREE.MeshStandardMaterial({
    color: 0xe7a52d,
    roughness: 0.72,
    transparent: true,
    opacity: 0.92
  });
  const floor = new THREE.Mesh(geometry, material);
  floor.name = 'active-floor';
  floor.userData.kind = 'active-floor';
  floor.userData.floor = selection.floor;
  floor.position.y = selection.baseY + selection.height / 2;
  floor.castShadow = true;
  floor.receiveShadow = true;
  group.add(floor);
}
