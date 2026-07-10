import * as THREE from 'three';
import { floorBaseY, totalBuildingHeight } from '../domain/buildings/floorMath.js';
import { rectUnionToPolygons } from '../domain/buildings/rectUnion.js';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { createWallSegments } from '../domain/buildings/createWallSegments.js';
import { applyBuildingTransform, getOuterRing } from './buildingSceneHelpers.js';

const EPS = 1e-4;

const openingFrameMaterial = new THREE.LineBasicMaterial({
  color: 0xf1b746, transparent: true, opacity: 0.95
});

// Real-lighting interior: the room is lit by the scene's sun (DirectionalLight
// with shadow map) and sky hemisphere light. Openings are cut in the geometry
// wherever the area boundary lies on a footprint wall, so sunlight physically
// enters through the holes; the ceiling and solid walls cast shadows.
function faceMaterial(color = 0xf2f0ec) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.92, metalness: 0,
    transparent: true, opacity: 0.97, side: THREE.DoubleSide
  });
}

// Is the ring edge a-b lying on one of the building's footprint walls?
// (Both are axis-aligned; collinear + contained ⇒ this boundary edge faces the
// outside world and is an opening, not a partition.)
function edgeOnFootprint(a, b, walls) {
  for (const wall of walls) {
    const [sx, sz] = wall.start;
    const [ex, ez] = wall.end;
    if (Math.abs(sz - ez) < EPS) { // wall runs along x at z = sz
      if (Math.abs(a.z - sz) > EPS || Math.abs(b.z - sz) > EPS) continue;
      const lo = Math.min(sx, ex) - EPS, hi = Math.max(sx, ex) + EPS;
      if (a.x >= lo && a.x <= hi && b.x >= lo && b.x <= hi) return true;
    } else if (Math.abs(sx - ex) < EPS) { // wall runs along z at x = sx
      if (Math.abs(a.x - sx) > EPS || Math.abs(b.x - sx) > EPS) continue;
      const lo = Math.min(sz, ez) - EPS, hi = Math.max(sz, ez) + EPS;
      if (a.z >= lo && a.z <= hi && b.z >= lo && b.z <= hi) return true;
    }
  }
  return false;
}

// Triangulate the area union polygons into a horizontal plane mesh.
function buildAreaPlaneGeometry(polys) {
  const geoms = [];
  for (const poly of polys) {
    const shape = new THREE.Shape();
    poly.outer.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)));
    for (const hole of poly.holes) {
      const path = new THREE.Path();
      hole.forEach((p, i) => (i === 0 ? path.moveTo(p.x, -p.z) : path.lineTo(p.x, -p.z)));
      shape.holes.push(path);
    }
    geoms.push(new THREE.ShapeGeometry(shape));
  }
  if (geoms.length === 1) return geoms[0];
  const merged = new THREE.BufferGeometry();
  const pos = [];
  for (const g of geoms) {
    const arr = g.getAttribute('position').array;
    const idx = g.index ? g.index.array : null;
    if (idx) for (const i of idx) pos.push(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
    else for (let i = 0; i < arr.length; i += 1) pos.push(arr[i]);
    g.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  merged.computeVertexNormals();
  return merged;
}

export function createInteriorFloor(building, floor, area) {
  const params = building.params;
  const baseY = floorBaseY({ floor, ...params });
  const topY = baseY + params.floorHeight;
  const group = new THREE.Group();
  group.name = 'interior-floor';
  group.userData.kind = 'interior-floor';

  const polys = rectUnionToPolygons(area.rects ?? []);
  const footprintWalls = createWallSegments(createFootprint(building.template, params));

  // Floor: receives the sun patches and shadows.
  const floorMesh = new THREE.Mesh(buildAreaPlaneGeometry(polys), faceMaterial(0xe9e5dd));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = baseY + 0.01;
  floorMesh.receiveShadow = true;
  floorMesh.userData = { ...floorMesh.userData, kind: 'floor' };
  group.add(floorMesh);

  // Ceiling: blocks overhead sun (casts shadow down onto the room).
  const ceiling = new THREE.Mesh(buildAreaPlaneGeometry(polys), faceMaterial(0xf4f2ee));
  ceiling.rotation.x = -Math.PI / 2;
  ceiling.position.y = topY;
  ceiling.castShadow = true;
  ceiling.receiveShadow = true;
  ceiling.userData = { ...ceiling.userData, kind: 'ceiling' };
  group.add(ceiling);

  // Walls: solid partitions cast/receive shadows; boundary edges lying on the
  // building footprint are openings — no geometry there, sunlight pours in.
  polys.forEach(poly => {
    const rings = [poly.outer, ...(poly.holes ?? [])];
    rings.forEach(ring => {
      for (let e = 0; e < ring.length; e += 1) {
        const a = ring[e];
        const b = ring[(e + 1) % ring.length];
        if (edgeOnFootprint(a, b, footprintWalls)) {
          // Opening: no wall here — outline it in gold so the aperture reads
          // as an intentional daylight opening, not missing geometry.
          const frame = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(a.x, baseY + 0.02, a.z),
              new THREE.Vector3(b.x, baseY + 0.02, b.z),
              new THREE.Vector3(b.x, topY - 0.02, b.z),
              new THREE.Vector3(a.x, topY - 0.02, a.z)
            ]),
            openingFrameMaterial
          );
          frame.userData.kind = 'opening-frame';
          group.add(frame);
          continue;
        }
        // Thin box instead of a single plane: front-face-only shading avoids
        // the double-sided shadow acne stripes, and walls read as real walls.
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const wallMat = faceMaterial();
        wallMat.side = THREE.FrontSide;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len, topY - baseY, 0.12), wallMat);
        wall.position.set((a.x + b.x) / 2, (baseY + topY) / 2, (a.z + b.z) / 2);
        wall.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        wall.castShadow = true;
        wall.receiveShadow = true;
        wall.userData = { ...wall.userData, kind: 'wall' };
        group.add(wall);
      }
    });
  });

  applyBuildingTransform(group, building);
  return group;
}

// Invisible shadow caster standing in for the host building while its render
// mesh is hidden: the full extrusion MINUS the focused floor's band. Floors
// below and above keep blocking sunlight (so the room's light and the ground
// shadow stay physically plausible); the focused floor's walls come from the
// interior room itself, openings included.
export function createHostShadowGhost(building, floor, area) {
  const params = building.params;
  const baseY = floorBaseY({ floor, ...params });
  const topY = baseY + params.floorHeight;
  const totalH = totalBuildingHeight(params);
  const footprint = createFootprint(building.template, params);

  const footprintShape = () => {
    const shape = new THREE.Shape();
    getOuterRing(footprint).forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
    shape.closePath();
    for (const hole of Array.isArray(footprint) ? [] : footprint.holes) {
      const path = new THREE.Path();
      hole.forEach(([x, z], i) => (i === 0 ? path.moveTo(x, -z) : path.lineTo(x, -z)));
      shape.holes.push(path);
    }
    return shape;
  };
  const shape = footprintShape();

  const ghostMaterial = new THREE.MeshStandardMaterial({ colorWrite: false, depthWrite: false });
  const group = new THREE.Group();
  group.name = 'host-shadow-ghost';

  const addSlab = (slabShape, fromY, toY) => {
    if (toY - fromY <= 0.01) return;
    const geom = new THREE.ExtrudeGeometry(slabShape, { depth: toY - fromY, steps: 1, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, ghostMaterial);
    mesh.position.y = fromY;
    mesh.castShadow = true;
    group.add(mesh);
  };
  addSlab(shape, 0, baseY);        // floors below
  addSlab(shape, topY, totalH);    // floors above

  // Same-floor band OUTSIDE the observation area: the room supplies its own
  // walls, but the rest of this floor must still block light (otherwise the
  // ground shadow shows a bright slit through the building). Footprint minus
  // the area's outer rings; a ring-shaped area's inner island is a rare case
  // the Shape API can't express and is accepted as a small light leak.
  const midShape = footprintShape();
  for (const poly of rectUnionToPolygons(area?.rects ?? [])) {
    const path = new THREE.Path();
    poly.outer.forEach((p, i) => (i === 0 ? path.moveTo(p.x, -p.z) : path.lineTo(p.x, -p.z)));
    midShape.holes.push(path);
  }
  addSlab(midShape, baseY, topY);

  applyBuildingTransform(group, building);
  return group;
}
