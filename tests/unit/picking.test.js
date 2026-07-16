import { describe, expect, it, vi } from 'vitest';
import { createRoomOverlay } from '../../src/scene/roomOverlay.js';
import { createFloorSlab } from '../../src/scene/floorFocus.js';
import { pointerToNdc, resolvePickedEntity } from '../../src/scene/picking.js';


describe('scene picking', () => {
  it('walks to the nearest tagged parent', () => {
    const parent = { userData: { entityId: 'building-a' }, parent: null };
    const child = { userData: {}, parent };

    expect(resolvePickedEntity([{ object: child }])).toBe('building-a');
  });

  it('converts a pointer relative to the canvas', () => {
    const ndc = pointerToNdc(
      { clientX: 150, clientY: 75 },
      { left: 50, top: 25, width: 200, height: 100 }
    );

    expect(ndc).toEqual({ x: 0, y: 0 });
  });
});

describe('floor focus resources', () => {
  it('disposes geometry owned by the temporary floor slab', () => {
    const slab = createFloorSlab({
      template: 'bar',
      position: { x: 0, z: 0 },
      rotation: 0,
      params: { length: 20, depth: 10, floors: 2, floorHeight: 3 }
    }, 1);
    const dispose = vi.spyOn(slab.children[0].geometry, 'dispose');

    slab.userData.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });
});
describe('editing overlays', () => {
  it('creates a tagged room overlay', () => {
    const room = createRoomOverlay({
      rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }, { x0: 1, z0: 0, x1: 2, z1: 1 }],
      baseY: 6,
      lit: false
    });
    // The two adjacent rects merge into one polygonal shape (one mesh).
    expect(room.children).toHaveLength(1);
    expect(room.userData.kind).toBe('room-overlay');
  });

  it('disposes geometry owned by a room overlay', () => {
    const room = createRoomOverlay({
      rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }],
      baseY: 0,
      wallHeight: 3
    });
    const disposers = room.children.map(child => vi.spyOn(child.geometry, 'dispose'));

    room.userData.dispose();

    expect(disposers.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
  });
  it('marks a draft room overlay', () => {
    const draftGroup = createRoomOverlay({
      rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }], baseY: 6, draft: true
    });
    expect(draftGroup.userData.draft).toBe(true);
    expect(draftGroup.children).toHaveLength(1);
  });
});
