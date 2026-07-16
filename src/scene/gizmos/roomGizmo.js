import * as THREE from 'three';
import { floorBaseY } from '../../domain/buildings/floorMath.js';
import { applyBuildingTransform } from '../buildingSceneHelpers.js';

const MIN_SIZE = 0.2;
const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xe5a52d, depthTest: false });
const cornerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });

export function roomRectFromHandle(rect, handle, point, startPoint) {
  if (handle.kind === 'move') {
    const dx = point.x - startPoint.x;
    const dz = point.z - startPoint.z;
    return { x0: rect.x0 + dx, z0: rect.z0 + dz, x1: rect.x1 + dx, z1: rect.z1 + dz };
  }
  const next = { ...rect };
  if (handle.corner.includes('w')) next.x0 = Math.min(point.x, rect.x1 - MIN_SIZE);
  if (handle.corner.includes('e')) next.x1 = Math.max(point.x, rect.x0 + MIN_SIZE);
  if (handle.corner.includes('n')) next.z0 = Math.min(point.z, rect.z1 - MIN_SIZE);
  if (handle.corner.includes('s')) next.z1 = Math.max(point.z, rect.z0 + MIN_SIZE);
  return next;
}

function addHandle(group, metadata, position, center = false) {
  const visual = new THREE.Mesh(
    new THREE.BoxGeometry(center ? 0.26 : 0.2, 0.1, center ? 0.26 : 0.2),
    center ? centerMaterial : cornerMaterial
  );
  visual.position.set(position.x, position.y, position.z);
  visual.renderOrder = 35;
  group.add(visual);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 0.82), hitMaterial);
  hit.position.copy(visual.position);
  hit.userData.roomHandle = metadata;
  group.add(hit);
}

export function createRoomRectGizmo(building, floor, rects) {
  const group = new THREE.Group();
  group.name = `room-rect-gizmo:${building.id}:${floor}`;
  group.userData.kind = 'room-rect-gizmo';
  applyBuildingTransform(group, building);
  const y = floorBaseY({ floor, ...building.params }) + 0.28;
  rects.forEach((rect, rectIndex) => {
    const base = { buildingId: building.id, floor, rectIndex };
    addHandle(group, { ...base, kind: 'move' }, {
      x: (rect.x0 + rect.x1) / 2, y, z: (rect.z0 + rect.z1) / 2
    }, true);
    addHandle(group, { ...base, kind: 'corner', corner: 'nw' }, { x: rect.x0, y, z: rect.z0 });
    addHandle(group, { ...base, kind: 'corner', corner: 'ne' }, { x: rect.x1, y, z: rect.z0 });
    addHandle(group, { ...base, kind: 'corner', corner: 'sw' }, { x: rect.x0, y, z: rect.z1 });
    addHandle(group, { ...base, kind: 'corner', corner: 'se' }, { x: rect.x1, y, z: rect.z1 });
  });
  group.userData.dispose = () => group.traverse(child => child.geometry?.dispose());
  return group;
}

export function resolveRoomHandle(intersections) {
  for (const intersection of intersections) {
    let object = intersection.object;
    while (object) {
      if (object.userData?.roomHandle) return object.userData.roomHandle;
      object = object.parent;
    }
  }
  return null;
}
