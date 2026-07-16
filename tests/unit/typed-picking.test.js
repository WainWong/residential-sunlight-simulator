import { expect, it } from 'vitest';
import * as THREE from 'three';
import { resolvePickedEntity } from '../../src/scene/picking.js';

it('returns the nearest typed scene selection before the building fallback', () => {
  const building = { userData: { entityId: 'b1' }, parent: null };
  const wall = {
    userData: { selection: { kind: 'wall', id: 'wall:1:a', buildingId: 'b1', floor: 1 } },
    parent: building
  };
  const opening = {
    userData: { selection: { kind: 'opening', id: 'o1', buildingId: 'b1' } },
    parent: wall
  };
  expect(resolvePickedEntity([{ object: opening }])).toEqual({ kind: 'opening', id: 'o1', buildingId: 'b1' });
  expect(resolvePickedEntity([{ object: wall }])).toEqual({ kind: 'wall', id: 'wall:1:a', buildingId: 'b1', floor: 1 });
});

it('derives a wall click position from the ray intersection in building-local coordinates', () => {
  const building = new THREE.Group();
  building.userData.entityId = 'b1';
  building.position.set(10, 0, -4);
  building.rotation.y = Math.PI / 3;
  const wall = new THREE.Object3D();
  wall.userData.selection = {
    kind: 'wall', id: 'wall:1:a', buildingId: 'b1', floor: 1, centerU: 0.5
  };
  wall.userData.wallPick = { start: [0, 0], end: [8, 0] };
  building.add(wall);
  building.updateMatrixWorld(true);
  const point = building.localToWorld(new THREE.Vector3(2, 1, 0));

  const selection = resolvePickedEntity([{ object: wall, point }]);
  expect(selection).toMatchObject({ kind: 'wall', id: 'wall:1:a' });
  expect(selection.centerU).toBeCloseTo(0.25);
});
