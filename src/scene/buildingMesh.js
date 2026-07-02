import * as THREE from 'three';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { floorBaseY, totalBuildingHeight } from '../domain/buildings/floorMath.js';

const buildingMaterial = new THREE.MeshStandardMaterial({
  color: 0xa9b2b2,
  roughness: 0.82,
  metalness: 0.02
});
const floorLineMaterial = new THREE.LineBasicMaterial({
  color: 0x697576,
  transparent: true,
  opacity: 0.52
});

function ringToShape(shape, ring) {
  ring.forEach(([x, z], index) => {
    const method = index === 0 ? 'moveTo' : 'lineTo';
    shape[method](x, -z);
  });
  shape.closePath();
}

function footprintShape(footprint) {
  const outer = Array.isArray(footprint) ? footprint : footprint.outer;
  const shape = new THREE.Shape();
  ringToShape(shape, outer);
  for (const hole of Array.isArray(footprint) ? [] : footprint.holes) {
    const path = new THREE.Path();
    ringToShape(path, hole);
    shape.holes.push(path);
  }
  return shape;
}

function floorLines(footprint, building) {
  const outer = Array.isArray(footprint) ? footprint : footprint.outer;
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

export function createBuildingMesh(building) {
  const footprint = createFootprint(building.template, building.params);
  const height = totalBuildingHeight(building.params);
  const geometry = new THREE.ExtrudeGeometry(footprintShape(footprint), {
    depth: height,
    steps: 1,
    bevelEnabled: false
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const solid = new THREE.Mesh(geometry, buildingMaterial);
  solid.castShadow = true;
  solid.receiveShadow = true;
  solid.userData.kind = 'building-solid';
  solid.userData.entityId = building.id;

  const group = new THREE.Group();
  group.name = `building:${building.id}`;
  group.userData.entityId = building.id;
  group.userData.revision = building.revision ?? 0;
  group.userData.totalHeight = height;
  group.position.set(building.position.x, 0, building.position.z);
  group.rotation.y = THREE.MathUtils.degToRad(building.rotation);
  group.add(solid);

  const lines = floorLines(footprint, building);
  if (lines) group.add(lines);

  group.userData.dispose = () => {
    group.traverse(child => child.geometry?.dispose());
  };
  return group;
}
