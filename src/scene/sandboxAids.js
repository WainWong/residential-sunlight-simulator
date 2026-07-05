import * as THREE from 'three';

export function createSandboxAids({ size = 800, cellSize = 10 } = {}) {
  const group = new THREE.Group();
  group.name = 'sandbox-aids';
  group.userData.kind = 'sandbox-aids';

  const grid = new THREE.GridHelper(
    size,
    size / cellSize,
    0x6f8792,
    0x9faeb2
  );
  grid.name = 'ten-meter-grid';
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  grid.userData.nonPickable = true;

  const origin = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshBasicMaterial({ color: 0x24495a, depthWrite: false })
  );
  origin.name = 'coordinate-origin';
  origin.rotation.x = -Math.PI / 2;
  origin.position.y = 0.03;
  origin.userData.nonPickable = true;

  group.add(grid, origin);
  return group;
}
