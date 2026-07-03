import * as THREE from 'three';

export function createSunOverlay({ direction, origin = [0, 0.2, 0], length = 36 }) {
  const group = new THREE.Group();
  group.name = 'sun-overlay';
  group.userData.kind = 'sun-overlay';
  const vector = new THREE.Vector3(...direction).normalize();

  const arrow = new THREE.ArrowHelper(
    vector,
    new THREE.Vector3(...origin),
    length,
    0xe7a52d,
    3.2,
    1.8
  );
  arrow.userData.kind = 'sun-direction';
  group.add(arrow);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 20, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd978 })
  );
  sun.position.copy(vector).multiplyScalar(length);
  sun.position.add(new THREE.Vector3(...origin));
  sun.userData.kind = 'sun-marker';
  group.add(sun);
  return group;
}
