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
const invalidMaterial = new THREE.MeshBasicMaterial({
  color: 0xb43e36, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false
});
// Semi-transparent walls rising along the room boundary turn the draft into a
// translucent-blue volume filling the carved cavity (floor plate + these side
// walls, open top so the top-down draw view stays clear). Rebuilt with the
// overlay whenever rects change, so the volume tracks the shape as the user draws.
const wallMaterial = new THREE.MeshBasicMaterial({
  color: 0x7fa6b2, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false
});

function buildRoomWalls(polygons, baseY, wallHeight) {
  const positions = [];
  const pushRing = ring => {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const y0 = baseY;
      const y1 = baseY + wallHeight;
      positions.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z);
      positions.push(a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z);
    }
  };
  for (const poly of polygons) {
    pushRing(poly.outer);
    for (const hole of poly.holes) pushRing(hole);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  const mesh = new THREE.Mesh(geom, wallMaterial);
  mesh.userData.kind = 'room-overlay-wall';
  mesh.renderOrder = 2;
  return mesh;
}

export function createRoomOverlay({ rects, baseY, lit = false, draft = false, invalid = false, wallHeight = 0 }) {
  const group = new THREE.Group();
  group.name = 'room-overlay';
  group.userData.kind = 'room-overlay';
  group.userData.draft = draft;
  group.userData.dispose = () => {
    group.traverse(child => child.geometry?.dispose());
  };
  const material = invalid ? invalidMaterial : draft ? draftMaterial : (lit ? litMaterial : selectedMaterial);

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
    mesh.userData.kind = 'room-overlay-floor';
    // Draw the projection after the floor slab regardless of camera angle, so
    // the blended color stays stable (both are transparent + depthWrite:false,
    // which otherwise flips draw order by distance as the view rotates).
    mesh.renderOrder = 3;
    group.add(mesh);
  }
  if (wallHeight > 0 && polygons.length > 0) {
    group.add(buildRoomWalls(polygons, baseY, wallHeight));
  }
  return group;
}
