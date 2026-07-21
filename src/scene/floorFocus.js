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

// 天花(观察层顶面及以上的外壳,即"盖子")的三档显隐:
//  - 'hide'  掀开,完全隐藏(默认,方便画/看室内)
//  - 'ghost' 半透明,既看得进去又保留有盖的空间感
//  - 'show'  完整盖着(外观如常)
// 纯视觉,不影响采光计算。
const GHOST_OPACITY = 0.22;

function applyCeilingMode(object, mode) {
  if (mode === 'hide') {
    object.visible = false;
    return;
  }
  object.visible = true;
  // 半透明只对有材质的网格生效;描边等子对象跟随可见性即可。
  const material = object.material;
  if (!material) return;
  if (mode === 'ghost') {
    if (!object.userData._ceilingGhosted) {
      object.userData._ceilingSharedMaterial = material;
      object.material = material.clone();
      object.material.transparent = true;
      object.userData._ceilingGhosted = true;
    }
    object.material.opacity = GHOST_OPACITY;
    object.material.depthWrite = false;
  } else if (object.userData._ceilingGhosted) {
    // 'show':还原共享实心材质
    object.material.dispose();
    object.material = object.userData._ceilingSharedMaterial;
    object.userData._ceilingGhosted = false;
  }
}

export function setFloorFocusVisibility(buildingRoot, buildingId, floor, bandToY, ceiling = 'hide') {
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
      if (isLidOrAbove(object, bandToY)) {
        applyCeilingMode(object, ceiling);
      } else {
        object.visible = true;
      }
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

