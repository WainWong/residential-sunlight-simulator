import * as THREE from 'three';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { floorBaseY, totalBuildingHeight } from '../domain/buildings/floorMath.js';
import { applyBuildingTransform, getOuterRing } from './buildingSceneHelpers.js';
import { buildSegmentMeshes } from './buildSegmentMeshes.js';

// 白底 × 顶点色:顶点色携带最终色调(墙灰、地板/顶面米色,见 buildSegmentMeshes),
// 所以外墙灰度和以前一致,水平面转米色,室内地板/墙一眼可分。
const buildingMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.82,
  metalness: 0.02
});
const blueprintMaterial = new THREE.MeshStandardMaterial({
  color: 0x35bfff,
  emissive: 0x0e668f,
  emissiveIntensity: 0.32,
  roughness: 0.36,
  metalness: 0.08,
  transparent: true,
  opacity: 0.42,
  depthWrite: false
});
const highlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.82,
  metalness: 0.02,
  emissive: 0x2f6d86,
  emissiveIntensity: 0.35
});
const floorLineMaterial = new THREE.LineBasicMaterial({
  color: 0x697576,
  transparent: true,
  opacity: 0.52
});

function floorLines(footprint, building) {
  const outer = getOuterRing(footprint);
  const vertices = [];
  for (let floor = 2; floor <= building.params.floors; floor += 1) {
    const y = floorBaseY({ floor, ...building.params }) + 0.004;
    outer.forEach((start, index) => {
      const end = outer[(index + 1) % outer.length];
      vertices.push(start[0], y, start[1], end[0], y, end[1]);
    });
  }
  if (vertices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const lines = new THREE.LineSegments(geometry, floorLineMaterial);
  lines.userData.kind = 'floor-lines';
  return lines;
}

export function createBuildingMesh(building, { preview = false, highlighted = false } = {}) {
  const footprint = createFootprint(building.template, building.params);
  const height = totalBuildingHeight(building.params);
  const material = preview ? blueprintMaterial : (highlighted ? highlightMaterial : buildingMaterial);

  const group = new THREE.Group();
  group.name = `building:${building.id}`;
  group.userData.entityId = building.id;
  group.userData.revision = building.revision ?? 0;
  group.userData.preview = preview;
  group.userData.highlighted = !preview && highlighted;
  group.userData.totalHeight = height;
  applyBuildingTransform(group, building);

  const { meshes } = buildSegmentMeshes(building, material);
  for (const mesh of meshes) {
    mesh.castShadow = !preview;
    mesh.receiveShadow = !preview;
    group.add(mesh);
  }

  const lines = floorLines(footprint, building);
  if (lines) group.add(lines);

  group.userData.dispose = () => {
    group.traverse(child => child.geometry?.dispose());
  };
  return group;
}
