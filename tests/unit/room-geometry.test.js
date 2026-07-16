import { describe, expect, it } from 'vitest';
import { normalizeRects, validateRoomRects } from '../../src/domain/rooms/roomGeometry.js';

describe('room geometry', () => {
  it('normalizes coordinates and accepts edge-connected rectangles', () => {
    const rects = normalizeRects([
      { x0: 2, z0: 2, x1: 0, z1: 0 },
      { x0: 2, z0: 0, x1: 4, z1: 1 }
    ]);
    expect(rects[0]).toEqual({ x0: 0, z0: 0, x1: 2, z1: 2 });
    expect(validateRoomRects(rects)).toEqual({ ok: true, reason: null });
  });

  it('rejects disconnected rectangles and area overlap', () => {
    expect(validateRoomRects([
      { x0: 0, z0: 0, x1: 1, z1: 1 },
      { x0: 2, z0: 0, x1: 3, z1: 1 }
    ]).reason).toBe('disconnected');
    expect(validateRoomRects([
      { x0: 0, z0: 0, x1: 2, z1: 2 },
      { x0: 1, z0: 1, x1: 3, z1: 3 }
    ]).reason).toBe('overlap');
  });

  it('rejects overlap with another room', () => {
    const result = validateRoomRects(
      [{ x0: 0, z0: 0, x1: 2, z1: 2 }],
      [{ x0: 1, z0: 0, x1: 3, z1: 2 }]
    );
    expect(result.reason).toBe('occupied');
  });
});
