import * as THREE from 'three';

const selectedMaterial = new THREE.MeshBasicMaterial({
  color: 0x4b6f78, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false
});
const litMaterial = new THREE.MeshBasicMaterial({
  color: 0xf3bd4f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false
});
const draftMaterial = new THREE.MeshBasicMaterial({
  color: 0x4b6f78, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false
});

export function createObservationOverlay({ rects, baseY, lit = false, draft = false }) {
  const group = new THREE.Group();
  group.name = 'observation-overlay';
  group.userData.kind = 'observation-overlay';
  group.userData.draft = draft;
  const material = draft ? draftMaterial : (lit ? litMaterial : selectedMaterial);
  for (const rect of rects ?? []) {
    const w = Math.abs(rect.x1 - rect.x0);
    const d = Math.abs(rect.z1 - rect.z0);
    if (w <= 0 || d <= 0) continue;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((rect.x0 + rect.x1) / 2, baseY + 0.018, (rect.z0 + rect.z1) / 2);
    mesh.userData.kind = 'observation-rect';
    group.add(mesh);
  }
  return group;
}
