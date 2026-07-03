import * as THREE from 'three';

export function createOpeningOverlay({ id, width, height, center, normal }) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xf1b746,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = `opening:${id}`;
  mesh.userData.entityId = id;
  mesh.userData.kind = 'opening-overlay';
  mesh.position.fromArray(center);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(...normal).normalize()
  );
  return mesh;
}
