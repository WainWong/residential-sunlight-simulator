import { describe, expect, it } from 'vitest';
import {
  createOpeningGizmo,
  openingBoundsFromHandle,
  resolveOpeningHandle
} from '../../src/scene/gizmos/openingGizmo.js';

const building = {
  id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
  params: { length: 10, depth: 8, floors: 1, floorHeight: 3 }
};
const wall = {
  id: 'wall:1:test', floor: 1, start: [-5, -4], end: [5, -4],
  normal: [0, -1], length: 10, roomIds: ['r1'], kind: 'exterior'
};
const opening = {
  id: 'o1', floor: 1, wallAnchor: { wallId: wall.id },
  bounds: { centerU: 0.5, width: 2, bottom: 0.8, top: 2.2 }
};

describe('opening gizmo', () => {
  it('moves a horizontal edge while keeping the opposite edge fixed', () => {
    const left = openingBoundsFromHandle(opening, wall, 'left', { u: 3.5, height: 1.5 }, 3);
    expect(left.width).toBeCloseTo(2.5);
    expect(left.centerU).toBeCloseTo(0.475);
    const rightEdge = left.centerU * wall.length + left.width / 2;
    expect(rightEdge).toBeCloseTo(6);
  });

  it('moves bottom and top handles within the floor height', () => {
    expect(openingBoundsFromHandle(opening, wall, 'bottom', { u: 5, height: 1.1 }, 3).bottom).toBe(1.1);
    expect(openingBoundsFromHandle(opening, wall, 'top', { u: 5, height: 2.7 }, 3).top).toBe(2.7);
  });

  it('creates four restrained handles with enlarged pick targets', () => {
    const gizmo = createOpeningGizmo(building, wall, opening);
    const hitTargets = [];
    gizmo.traverse(child => {
      if (child.userData.openingHandle) hitTargets.push(child);
    });
    expect(new Set(hitTargets.map(child => child.userData.openingHandle.edge))).toEqual(
      new Set(['left', 'right', 'bottom', 'top'])
    );
    expect(resolveOpeningHandle([{ object: hitTargets[0] }])).toMatchObject({ openingId: 'o1' });
  });
});
