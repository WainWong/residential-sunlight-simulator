import * as THREE from 'three';
import { rectUnionToPolygons } from '../domain/buildings/rectUnion.js';

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

  // Render the union of the rects as a single continuous shape per connected
  // component (with holes), so adjacent rects form one polygonal region
  // instead of separate planes with seams.
  const polygons = rectUnionToPolygons(rects);
  for (const poly of polygons) {
    const shape = new THREE.Shape();
    poly.outer.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)));
    for (const hole of poly.holes) {
      const path = new THREE.Path();
      hole.forEach((p, i) => (i === 0 ? path.moveTo(p.x, -p.z) : path.lineTo(p.x, -p.z)));
      shape.holes.push(path);
    }
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, baseY + 0.018, 0);
    mesh.userData.kind = 'observation-rect';
    group.add(mesh);
  }
  return group;
}
