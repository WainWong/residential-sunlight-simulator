import * as THREE from 'three';
import { getBuildingTypeDefinition } from '../../domain/buildings/buildingTypes.js';
import { applyBuildingTransform } from '../buildingSceneHelpers.js';

export function rotationFromPointer(center, point) {
  const degrees = Math.atan2(-(point.z - center.z), point.x - center.x) * 180 / Math.PI;
  return (degrees + 360) % 360;
}

export function rotationFromDrag(building, startPoint, currentPoint) {
  const startAngle = rotationFromPointer(building.position, startPoint);
  const currentAngle = rotationFromPointer(building.position, currentPoint);
  return (building.rotation + currentAngle - startAngle + 360) % 360;
}

export function gizmoCursor(handle, active = false) {
  if (!handle) return '';
  if (handle.type === 'move') return 'move';
  if (handle.type === 'rotate') return active ? 'grabbing' : 'grab';
  if (handle.type === 'resize') return handle.axis === 'x' ? 'ew-resize' : 'ns-resize';
  return '';
}

const accentGold = 0xe7a52d;
const ringMaterial = new THREE.MeshBasicMaterial({
  color: accentGold,
  transparent: true,
  opacity: 0.96,
  depthTest: true,
  depthWrite: false
});
const hitMaterial = new THREE.MeshBasicMaterial({
  transparent: true, opacity: 0, depthTest: false, depthWrite: false
});

function addRotationMarker(group, building, angle, radius, markerSize) {
  const rotateHandle = { type: 'rotate', buildingId: building.id };
  const anchor = new THREE.Object3D();
  anchor.position.set(radius * Math.cos(angle), 0.42, radius * Math.sin(angle));
  anchor.userData.kind = 'building-rotation-overlay-anchor';
  anchor.userData.overlayIcon = 'rotate';
  group.add(anchor);

  const hitSize = markerSize * 2.4;
  const hitTarget = new THREE.Mesh(new THREE.BoxGeometry(hitSize, 1, hitSize), hitMaterial);
  hitTarget.position.copy(anchor.position);
  hitTarget.position.y = 0.35;
  hitTarget.userData.kind = 'building-rotation-marker-hit-target';
  hitTarget.userData.gizmo = rotateHandle;
  group.add(hitTarget);
}

function addResizeHandle(group, building, control, gripSize, capsuleHeight, handleOffset) {
  const point = control.anchor(building.params);
  const x = point.x + control.normal.x * handleOffset;
  const z = point.z + control.normal.z * handleOffset;
  const anchor = new THREE.Object3D();
  anchor.position.set(x, 0.42, z);
  anchor.position.y = 0.42;
  anchor.userData.kind = 'building-resize-overlay-anchor';
  anchor.userData.overlayIcon = 'resize';
  anchor.userData.axis = control.axis;
  anchor.userData.sign = control.sign;
  anchor.userData.controlId = control.id;
  group.add(anchor);

  const hitSize = gripSize + 1.35;
  const hitTarget = new THREE.Mesh(
    new THREE.BoxGeometry(hitSize, Math.max(1, capsuleHeight * 1.25), capsuleHeight + 1.35), hitMaterial);
  hitTarget.position.copy(anchor.position);
  hitTarget.position.y = 0.36;
  hitTarget.rotation.y = control.axis === 'x' ? Math.PI / 2 : 0;
  hitTarget.userData.kind = 'building-resize-hit-target';
  hitTarget.userData.gizmo = {
    type: 'resize', buildingId: building.id,
    controlId: control.id, axis: control.axis, sign: control.sign
  };
  group.add(hitTarget);
}

export function createBuildingGizmo(building) {
  const group = new THREE.Group();
  group.name = `building-gizmo:${building.id}`;
  group.renderOrder = 20;
  applyBuildingTransform(group, building);
  const definition = getBuildingTypeDefinition(building.template);
  const footprint = definition.createFootprint(building.params);
  const outer = Array.isArray(footprint) ? footprint : footprint.outer;
  const footprintRadius = Math.max(...outer.map(([x, z]) => Math.hypot(x, z)));
  const referenceRadius = footprintRadius + 1.7;
  const gripSize = THREE.MathUtils.clamp(referenceRadius * 0.125, 2.7, 4.2);
  const markerSize = THREE.MathUtils.clamp(referenceRadius * 0.105, 2.5, 3.8);
  const radius = footprintRadius + Math.max(3.2, gripSize * 0.95 + markerSize * 0.8);
  const rotateHandle = { type: 'rotate', buildingId: building.id };
  const capsuleHeight = THREE.MathUtils.clamp(gripSize * 0.42, 1.2, 1.75);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.28, 12, 96), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.18;
  ring.renderOrder = 20;
  ring.userData.kind = 'building-rotation-ring';
  ring.userData.gizmo = rotateHandle;
  group.add(ring);

  const ringHitTarget = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.5, 8, 72), hitMaterial);
  ringHitTarget.rotation.x = Math.PI / 2;
  ringHitTarget.position.y = 0.18;
  ringHitTarget.userData.kind = 'building-rotation-hit-target';
  ringHitTarget.userData.gizmo = rotateHandle;
  group.add(ringHitTarget);

  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    addRotationMarker(group, building, angle, radius, markerSize);
  }

  const handleOffset = capsuleHeight / 2 + 0.45;
  for (const control of definition.getDimensionControls(building.params)) {
    addResizeHandle(group, building, control, gripSize, capsuleHeight, handleOffset);
  }

  group.userData.dispose = () => group.traverse(child => child.geometry?.dispose());
  return group;
}

export function resolveGizmo(intersections) {
  let blockedByEntity = false;
  for (const intersection of intersections) {
    let object = intersection.object;
    while (object) {
      if (object.userData?.gizmo) {
        const handle = object.userData.gizmo;
        return blockedByEntity ? null : handle;
      }
      if (object.userData?.entityId) {
        blockedByEntity = true;
        break;
      }
      object = object.parent;
    }
  }
  return null;
}
