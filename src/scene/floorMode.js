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
  const segments = group.children.filter(child => child.userData.kind === 'building-segment');
  if (segments.length === 0) return;

  const bounds = new THREE.Box3();
  for (const segment of segments) {
    if (!segment.userData.floorModeMaterial) {
      segment.material = segment.material.clone();
      segment.userData.floorModeMaterial = true;
    }
    segment.material.transparent = Boolean(selection);
    segment.material.opacity = selection ? 0.18 : 1;
    segment.material.depthWrite = !selection;
    segment.material.needsUpdate = true;
    segment.geometry.computeBoundingBox();
    bounds.union(segment.geometry.boundingBox);
  }
  if (!selection) return;

  const size = new THREE.Vector3();
  bounds.getSize(size);
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
