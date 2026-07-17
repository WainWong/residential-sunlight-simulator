import * as THREE from 'three';
import { floorBaseY } from '../domain/buildings/floorMath.js';
import { rectUnionToPolygons } from '../domain/buildings/rectUnion.js';
import { deriveWalls } from '../domain/walls/deriveWalls.js';
import { OPENING_GLASS, OPENING_OPEN, ROOM_FLOOR, ROOM_WALL } from './sceneTags.js';

const WALL_THICKNESS = 0.12;
const EPS = 1e-5;
const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0xc9b77d, roughness: 0.88, metalness: 0, transparent: true, opacity: 0.32,
  side: THREE.DoubleSide, depthWrite: false
});
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x85bdd0, roughness: 0.18, metalness: 0, transmission: 0.28,
  transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false
});
const openMaterial = new THREE.MeshBasicMaterial({
  color: 0x4aa58c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false
});

function polygonShape(poly) {
  const shape = new THREE.Shape();
  poly.outer.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.z); else shape.lineTo(point.x, -point.z);
  });
  shape.closePath();
  for (const ring of poly.holes ?? []) {
    const hole = new THREE.Path();
    ring.forEach((point, index) => {
      if (index === 0) hole.moveTo(point.x, -point.z); else hole.lineTo(point.x, -point.z);
    });
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}

function addRoomFloors(group, building) {
  for (const room of building.rooms ?? []) {
    const y = floorBaseY({ floor: room.floor, ...building.params }) + 0.16;
    for (const poly of rectUnionToPolygons(room.rects ?? [])) {
      const geometry = new THREE.ShapeGeometry(polygonShape(poly));
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, floorMaterial);
      mesh.position.y = y;
      mesh.userData.selection = { kind: 'room', id: room.id, buildingId: building.id };
      mesh.userData.kind = ROOM_FLOOR;
      group.add(mesh);
      mesh.userData.floor = room.floor;
    }
  }
}

function wallOpenings(building, wall) {
  return (building.openings ?? []).filter(opening =>
    opening.status !== 'invalid' && opening.floor === wall.floor
    && opening.wallAnchor?.wallId === wall.id
  );
}

function addWallCell(group, building, wall, material, u0, u1, y0, y1) {
  if (u1 - u0 <= EPS || y1 - y0 <= EPS) return;
  const dirX = (wall.end[0] - wall.start[0]) / wall.length;
  const dirZ = (wall.end[1] - wall.start[1]) / wall.length;
  const midU = (u0 + u1) / 2;
  const baseY = floorBaseY({ floor: wall.floor, ...building.params });
  const geometry = new THREE.BoxGeometry(u1 - u0, y1 - y0, WALL_THICKNESS);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    wall.start[0] + dirX * midU,
    baseY + (y0 + y1) / 2,
    wall.start[1] + dirZ * midU
  );
  mesh.rotation.y = -Math.atan2(dirZ, dirX);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.kind = ROOM_WALL;
  mesh.userData.wallId = wall.id;
  mesh.userData.floor = wall.floor;
  mesh.userData.wallPick = { start: [...wall.start], end: [...wall.end] };
  mesh.userData.selection = {
    kind: 'wall', id: wall.id, buildingId: building.id, floor: wall.floor,
    centerU: wall.length ? midU / wall.length : 0.5
  };
  group.add(mesh);
}

function addOpeningSurface(group, building, wall, opening) {
  const dirX = (wall.end[0] - wall.start[0]) / wall.length;
  const dirZ = (wall.end[1] - wall.start[1]) / wall.length;
  const center = opening.bounds.centerU * wall.length;
  const height = opening.bounds.top - opening.bounds.bottom;
  const baseY = floorBaseY({ floor: wall.floor, ...building.params });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(opening.bounds.width, height),
    opening.fill === 'glass' ? glassMaterial : openMaterial
  );
  mesh.position.set(
    wall.start[0] + dirX * center + wall.normal[0] * (WALL_THICKNESS / 2 + 0.004),
    baseY + opening.bounds.bottom + height / 2,
    wall.start[1] + dirZ * center + wall.normal[1] * (WALL_THICKNESS / 2 + 0.004)
  );
  mesh.rotation.y = -Math.atan2(dirZ, dirX);
  mesh.userData.kind = opening.fill === 'glass' ? OPENING_GLASS : OPENING_OPEN;
  mesh.userData.selection = { kind: 'opening', id: opening.id, buildingId: building.id };
  mesh.userData.floor = wall.floor;
  group.add(mesh);
}

function addDerivedWalls(group, building, material) {
  for (let floor = 1; floor <= building.params.floors; floor += 1) {
    for (const wall of deriveWalls(building, floor)) {
      const openings = wallOpenings(building, wall);
      const uCuts = [0, wall.length];
      const yCuts = [0, building.params.floorHeight];
      for (const opening of openings) {
        const center = opening.bounds.centerU * wall.length;
        uCuts.push(Math.max(0, center - opening.bounds.width / 2), Math.min(wall.length, center + opening.bounds.width / 2));
        yCuts.push(Math.max(0, opening.bounds.bottom), Math.min(building.params.floorHeight, opening.bounds.top));
      }
      const us = [...new Set(uCuts)].sort((a, b) => a - b);
      const ys = [...new Set(yCuts)].sort((a, b) => a - b);
      for (let ui = 0; ui < us.length - 1; ui += 1) {
        for (let yi = 0; yi < ys.length - 1; yi += 1) {
          const midU = (us[ui] + us[ui + 1]) / 2;
          const midY = (ys[yi] + ys[yi + 1]) / 2;
          const cut = openings.some(opening => {
            const center = opening.bounds.centerU * wall.length;
            return midU > center - opening.bounds.width / 2 + EPS
              && midU < center + opening.bounds.width / 2 - EPS
              && midY > opening.bounds.bottom + EPS && midY < opening.bounds.top - EPS;
          });
          if (!cut) addWallCell(group, building, wall, material, us[ui], us[ui + 1], ys[yi], ys[yi + 1]);
        }
      }
      openings.forEach(opening => addOpeningSurface(group, building, wall, opening));
    }
  }
}

export function createRoomGeometry(building, wallMaterial) {
  const group = new THREE.Group();
  group.name = `rooms:${building.id}`;
  addRoomFloors(group, building);
  addDerivedWalls(group, building, wallMaterial);
  return group;
}
