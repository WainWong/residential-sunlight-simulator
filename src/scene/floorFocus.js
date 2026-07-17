import * as THREE from 'three';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { floorBaseY } from '../domain/buildings/floorMath.js';
import { applyBuildingTransform, getOuterRing } from './buildingSceneHelpers.js';
import { isBuildingShell, isFloorLines, isLidOrAbove, isRoomGeometry } from './sceneTags.js';

export function floorFocusTarget(building, floor) {
  const y = floorBaseY({ floor, ...building.params });
  return { target: { x: building.position.x, y, z: building.position.z } };
}
export function restoreBuildingVisibility(buildingRoot) {
  buildingRoot.traverse(object => {
    object.visible = true;
  });
}

export function setFloorFocusVisibility(buildingRoot, buildingId, floor, bandToY) {
  restoreBuildingVisibility(buildingRoot);
  for (const buildingGroup of buildingRoot.children) {
    if (buildingGroup.userData?.entityId !== buildingId) continue;
    buildingGroup.traverse(object => {
      if (isRoomGeometry(object)) {
        object.visible = object.userData.floor < floor;
        return;
      }
      if (isFloorLines(object)) {
        object.visible = false;
        return;
      }
      if (!isBuildingShell(object)) return;
      object.visible = !isLidOrAbove(object, bandToY);
    });
  }
}


const slabMaterial = new THREE.MeshBasicMaterial({
  color: 0xf4ead2, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false
});
const slabOutlineMaterial = new THREE.LineBasicMaterial({ color: 0x8b691f, transparent: true, opacity: 0.95 });

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
  group.userData.dispose = () => {
    group.traverse(child => child.geometry?.dispose());
  };
  const slabGeometry = new THREE.ShapeGeometry(shape);
  const slab = new THREE.Mesh(slabGeometry, slabMaterial);
  slab.name = 'floor-slab-surface';
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = y + 0.01;

  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(slabGeometry), slabOutlineMaterial);
  outline.name = 'floor-slab-outline';
  outline.rotation.x = -Math.PI / 2;
  outline.position.y = y + 0.035;

  const gridSize = Math.max(1, Math.ceil(Math.max(building.params.length, building.params.depth)));
  const grid = new THREE.GridHelper(gridSize, gridSize, 0x9b7a2f, 0xc9b98e);
  grid.name = 'floor-drawing-grid';
  grid.position.y = y + 0.025;
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  grid.userData.cellSize = 1;

  group.add(slab, outline, grid);
  applyBuildingTransform(group, building);
  return group;
}

