import * as THREE from 'three';

const holeMaterial = new THREE.MeshBasicMaterial({
  color: 0x141b21,
  transparent: true,
  opacity: 0.88,
  side: THREE.DoubleSide,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2
});
const frameMaterial = new THREE.LineBasicMaterial({ color: 0xf1b746, transparent: true, opacity: 0.95 });

// A daylight opening on a building wall, drawn as a dark recessed hole with a
// gold frame. Pushed slightly out along the wall normal (plus polygon offset)
// so it never z-fights with the coplanar wall face.
export function createOpeningOverlay({ id, width, height, center, normal }) {
  const group = new THREE.Group();
  group.name = `opening:${id}`;
  group.userData.entityId = id;
  group.userData.kind = 'opening-overlay';

  const n = new THREE.Vector3(...normal).normalize();

  const hole = new THREE.Mesh(new THREE.PlaneGeometry(width, height), holeMaterial);
  hole.renderOrder = 2;

  const hw = width / 2, hh = height / 2;
  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hw, -hh, 0),
      new THREE.Vector3(hw, -hh, 0),
      new THREE.Vector3(hw, hh, 0),
      new THREE.Vector3(-hw, hh, 0)
    ]),
    frameMaterial
  );
  frame.renderOrder = 3;

  group.add(hole, frame);
  group.position.fromArray(center).addScaledVector(n, 0.06);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return group;
}
