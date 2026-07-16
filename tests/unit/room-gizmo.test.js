import { describe, expect, it } from 'vitest';
import {
  createRoomRectGizmo,
  resolveRoomHandle,
  roomRectFromHandle
} from '../../src/scene/gizmos/roomGizmo.js';

const building = {
  id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
  params: { length: 10, depth: 8, floors: 1, floorHeight: 3 }
};
const rect = { x0: -3, z0: -2, x1: 3, z1: 2 };

describe('room rectangle gizmo', () => {
  it('moves a complete rectangle block without resizing it', () => {
    expect(roomRectFromHandle(rect, { kind: 'move' }, { x: 2, z: 1 }, { x: 0, z: 0 }))
      .toEqual({ x0: -1, z0: -1, x1: 5, z1: 3 });
  });

  it('moves a corner while keeping the opposite corner fixed', () => {
    expect(roomRectFromHandle(rect, { kind: 'corner', corner: 'se' }, { x: 4, z: 3 }, { x: 0, z: 0 }))
      .toEqual({ x0: -3, z0: -2, x1: 4, z1: 3 });
  });

  it('creates a center handle and four corner handles for each rectangle', () => {
    const gizmo = createRoomRectGizmo(building, 1, [rect]);
    const handles = [];
    gizmo.traverse(child => {
      if (child.userData.roomHandle) handles.push(child);
    });
    expect(handles).toHaveLength(5);
    expect(resolveRoomHandle([{ object: handles[0] }])).toMatchObject({ rectIndex: 0 });
  });
});
