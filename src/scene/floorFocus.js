import * as THREE from 'three';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { floorBaseY } from '../domain/buildings/floorMath.js';
import { SLAB_THICKNESS } from '../domain/buildings/segmentBuilding.js';
import { applyBuildingTransform, getOuterRing } from './buildingSceneHelpers.js';

export function floorFocusTarget(building, floor) {
  const y = floorBaseY({ floor, ...building.params });
  return { target: { x: building.position.x, y, z: building.position.z } };
}
export function restoreBuildingVisibility(buildingRoot) {
  buildingRoot.traverse(object => {
    object.visible = true;
  });
}

const ROOM_GEOMETRY_KINDS = new Set(['room-floor', 'room-wall', 'opening-glass', 'opening-open']);

export function setFloorFocusVisibility(buildingRoot, buildingId, floor, bandToY) {
  restoreBuildingVisibility(buildingRoot);
  const hiddenFromY = bandToY - SLAB_THICKNESS - 0.01;
  for (const buildingGroup of buildingRoot.children) {
    if (buildingGroup.userData?.entityId !== buildingId) continue;
    buildingGroup.traverse(object => {
      const kind = object.userData?.kind;
      if (ROOM_GEOMETRY_KINDS.has(kind)) {
        object.visible = object.userData.floor < floor;
        return;
      }
      if (kind === 'floor-lines') {
        object.visible = false;
        return;
      }
      if (kind !== 'building-segment' && kind !== 'building-lid') return;
      object.visible = !(object.userData.fromY > hiddenFromY);
    });
  }
}


const slabMaterial = new THREE.MeshBasicMaterial({
  color: 0xdfe6e9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false
});

export function createFloorSlab(building, floor) {
  const footprint = createFootprint(building.template, building.params);
  const outer = getOuterRing(footprint);
  const shape = new THREE.Shape();
  outer.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  const y = floorBaseY({ floor, ...building.params });
  const group = new THREE.Group();
  group.name = 'floor-slab';
  group.userData.kind = 'floor-slab';
  const slab = new THREE.Mesh(new THREE.ShapeGeometry(shape), slabMaterial);
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = y + 0.01;
  group.add(slab);
  applyBuildingTransform(group, building);
  return group;
}

