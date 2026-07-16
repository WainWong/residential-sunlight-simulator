import * as THREE from 'three';
import { floorBaseY } from '../../domain/buildings/floorMath.js';
import { applyBuildingTransform } from '../buildingSceneHelpers.js';

const MIN_SIZE = 0.2;
const handleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
const handleAccentMaterial = new THREE.MeshBasicMaterial({ color: 0xe5a52d, depthTest: false });
const hitMaterial = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0, depthTest: false, depthWrite: false
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function openingBoundsFromHandle(opening, wall, edge, point, floorHeight) {
  const current = opening.bounds;
  const center = current.centerU * wall.length;
  const left = center - current.width / 2;
  const right = center + current.width / 2;
  if (edge === 'left') {
    const nextLeft = clamp(point.u, 0, right - MIN_SIZE);
    return { ...current, width: right - nextLeft, centerU: ((nextLeft + right) / 2) / wall.length };
  }
  if (edge === 'right') {
    const nextRight = clamp(point.u, left + MIN_SIZE, wall.length);
    return { ...current, width: nextRight - left, centerU: ((left + nextRight) / 2) / wall.length };
  }
  if (edge === 'bottom') {
    return { ...current, bottom: clamp(point.height, 0, current.top - MIN_SIZE) };
  }
  if (edge === 'top') {
    return { ...current, top: clamp(point.height, current.bottom + MIN_SIZE, floorHeight) };
  }
  return { ...current };
}

function pointOnWall(wall, u) {
  const ratio = wall.length ? u / wall.length : 0.5;
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * ratio,
    wall.start[1] + (wall.end[1] - wall.start[1]) * ratio
  ];
}

function addHandle(group, building, wall, opening, edge, u, height) {
  const baseY = floorBaseY({ floor: wall.floor, ...building.params });
  const point = pointOnWall(wall, u);
  const rotation = -Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
  const vertical = edge === 'left' || edge === 'right';
  const visual = new THREE.Mesh(
    new THREE.BoxGeometry(vertical ? 0.1 : 0.54, vertical ? 0.54 : 0.1, 0.08),
    edge === 'top' ? handleAccentMaterial : handleMaterial
  );
  visual.position.set(point[0] + wall.normal[0] * 0.14, baseY + height, point[1] + wall.normal[1] * 0.14);
  visual.rotation.y = rotation;
  visual.renderOrder = 40;
  group.add(visual);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(vertical ? 0.55 : 0.85, vertical ? 0.85 : 0.55, 0.22),
    hitMaterial
  );
  hit.position.copy(visual.position);
  hit.rotation.y = rotation;
  hit.userData.openingHandle = {
    type: 'opening-resize', edge, buildingId: building.id,
    openingId: opening.id, wallId: wall.id, floor: wall.floor
  };
  group.add(hit);
}

export function createOpeningGizmo(building, wall, opening) {
  const group = new THREE.Group();
  group.name = `opening-gizmo:${opening.id}`;
  group.userData.kind = 'opening-gizmo';
  applyBuildingTransform(group, building);
  const center = opening.bounds.centerU * wall.length;
  const left = center - opening.bounds.width / 2;
  const right = center + opening.bounds.width / 2;
  const middleHeight = (opening.bounds.bottom + opening.bounds.top) / 2;
  addHandle(group, building, wall, opening, 'left', left, middleHeight);
  addHandle(group, building, wall, opening, 'right', right, middleHeight);
  addHandle(group, building, wall, opening, 'bottom', center, opening.bounds.bottom);
  addHandle(group, building, wall, opening, 'top', center, opening.bounds.top);
  group.userData.dispose = () => group.traverse(child => child.geometry?.dispose());
  return group;
}

export function resolveOpeningHandle(intersections) {
  for (const intersection of intersections) {
    let object = intersection.object;
    while (object) {
      if (object.userData?.openingHandle) return object.userData.openingHandle;
      object = object.parent;
    }
  }
  return null;
}
