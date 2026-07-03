import * as THREE from 'three';

const selectedMaterial = new THREE.MeshBasicMaterial({
  color: 0x4b6f78,
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide,
  depthWrite: false
});
const litMaterial = new THREE.MeshBasicMaterial({
  color: 0xf3bd4f,
  transparent: true,
  opacity: 0.92,
  side: THREE.DoubleSide,
  depthWrite: false
});

export function createObservationOverlay({ cells, baseY, litSampleIds = [] }) {
  const litCells = new Set(litSampleIds.map(id => id.split(':').slice(0, 2).join(':')));
  const group = new THREE.Group();
  group.name = 'observation-overlay';
  group.userData.kind = 'observation-overlay';

  for (const [x, z] of cells) {
    const cellId = `${x}:${z}`;
    const cell = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.92),
      litCells.has(cellId) ? litMaterial : selectedMaterial
    );
    cell.rotation.x = -Math.PI / 2;
    cell.position.set(x + 0.5, baseY + 0.018, z + 0.5);
    cell.userData.kind = 'observation-cell';
    cell.userData.cell = [x, z];
    group.add(cell);
  }
  return group;
}
