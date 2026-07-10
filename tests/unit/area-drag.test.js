import { describe, expect, it } from 'vitest';
import { worldToLocalFloor, normalizeRect, applyRectEdit, createAreaDrag } from '../../src/scene/areaDrag.js';

function makeCanvas() {
  const handlers = {};
  return {
    addEventListener: (t, h) => { handlers[t] = h; },
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    fire: (t, e) => handlers[t]?.(e)
  };
}

describe('areaDrag pure helpers', () => {
  it('worldToLocalFloor inverts position and rotation (0deg)', () => {
    const b = { position: { x: 10, z: -4 }, rotation: 0 };
    expect(worldToLocalFloor([12, -1], b)).toEqual([2, 3]);
  });
  it('worldToLocalFloor inverts a 90deg rotation', () => {
    const b = { position: { x: 0, z: 0 }, rotation: 90 };
    const [lx, lz] = worldToLocalFloor([0, -1], b);
    expect(lx).toBeCloseTo(1, 6);
    expect(lz).toBeCloseTo(0, 6);
  });
  it('normalizeRect keeps corners', () => {
    expect(normalizeRect([1, 2], [3, 5])).toEqual({ x0: 1, z0: 2, x1: 3, z1: 5 });
  });
  it('draw appends a rect', () => {
    expect(applyRectEdit([], { x0: 0, z0: 0, x1: 1, z1: 1 }, 'draw')).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);
  });
  it('erase removes a fully covered rect', () => {
    const out = applyRectEdit([{ x0: 0, z0: 0, x1: 2, z1: 2 }], { x0: -1, z0: -1, x1: 3, z1: 3 }, 'erase');
    expect(out).toEqual([]);
  });
  it('erase splits a rect when cutting its middle', () => {
    const out = applyRectEdit([{ x0: 0, z0: 0, x1: 3, z1: 1 }], { x0: 1, z0: -1, x1: 2, z1: 2 }, 'erase');
    expect(out).toHaveLength(2);
  });
  it('merges two horizontally adjacent rects into one on draw', () => {
    const out = applyRectEdit(
      [{ x0: 0, z0: 0, x1: 2, z1: 2 }],
      { x0: 2, z0: 0, x1: 4, z1: 2 },
      'draw'
    );
    expect(out).toEqual([{ x0: 0, z0: 0, x1: 4, z1: 2 }]);
  });
  it('merges two vertically stacked rects into one on draw', () => {
    const out = applyRectEdit(
      [{ x0: 0, z0: 0, x1: 3, z1: 2 }],
      { x0: 0, z0: 2, x1: 3, z1: 4 },
      'draw'
    );
    expect(out).toEqual([{ x0: 0, z0: 0, x1: 3, z1: 4 }]);
  });
  it('does not merge rects that do not share a full edge', () => {
    const out = applyRectEdit(
      [{ x0: 0, z0: 0, x1: 2, z1: 2 }],
      { x0: 2, z0: 1, x1: 4, z1: 3 },
      'draw'
    );
    expect(out).toHaveLength(2);
  });
  it('merges overlapping rects', () => {
    const out = applyRectEdit(
      [{ x0: 0, z0: 0, x1: 3, z1: 3 }],
      { x0: 2, z0: 0, x1: 5, z1: 3 },
      'draw'
    );
    expect(out).toEqual([{ x0: 0, z0: 0, x1: 5, z1: 3 }]);
  });
});

describe('createAreaDrag interaction', () => {
  it('previews on move and commits on left-button up; ignores right button', () => {
    const canvas = makeCanvas();
    const previews = [];
    const commits = [];
    const camera = {};
    const building = { position: { x: 0, z: 0 }, rotation: 0 };
    const drag = createAreaDrag({
      canvas, camera, floorY: 0,
      getBuilding: () => building, getMode: () => 'draw',
      onPreview: r => previews.push(r), onCommit: (r, m) => commits.push([r, m])
    });

    // right button never starts a drag
    canvas.fire('pointerdown', { button: 2, clientX: 10, clientY: 10 });
    canvas.fire('pointerup', { button: 2, clientX: 20, clientY: 20 });
    expect(commits).toHaveLength(0);

    drag.dispose();
  });
});
