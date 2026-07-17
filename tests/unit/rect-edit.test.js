import { describe, expect, it } from 'vitest';
import { applyRectEdit, mergeRects } from '../../src/domain/rooms/rectEdit.js';

describe('rect edit', () => {
  it('unions an added rect, merging shared edges into one', () => {
    const out = applyRectEdit([{ x0: 0, z0: 0, x1: 4, z1: 4 }], { x0: 4, z0: 0, x1: 8, z1: 4 }, 'draw');
    expect(out).toEqual([{ x0: 0, z0: 0, x1: 8, z1: 4 }]);
  });

  it('erases an overlapping region, leaving the remainder', () => {
    const out = applyRectEdit([{ x0: 0, z0: 0, x1: 4, z1: 4 }], { x0: 2, z0: 0, x1: 4, z1: 4 }, 'erase');
    expect(out).toEqual([{ x0: 0, z0: 0, x1: 2, z1: 4 }]);
  });

  it('erasing the whole rect leaves nothing', () => {
    const out = applyRectEdit([{ x0: 0, z0: 0, x1: 4, z1: 4 }], { x0: -1, z0: -1, x1: 5, z1: 5 }, 'erase');
    expect(out).toEqual([]);
  });

  it('erasing a middle band splits into two disconnected rects', () => {
    const out = applyRectEdit([{ x0: 0, z0: 0, x1: 4, z1: 6 }], { x0: 0, z0: 2, x1: 4, z1: 4 }, 'erase');
    expect(mergeRects(out)).toHaveLength(2);
  });
});
