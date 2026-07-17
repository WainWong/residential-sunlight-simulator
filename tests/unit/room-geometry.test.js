import { describe, expect, it } from 'vitest';
import { normalizeRects, roomInteriorFrame, validateRoomRects } from '../../src/domain/rooms/roomGeometry.js';

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

describe('roomInteriorFrame', () => {
  const building = {
    position: { x: 10, z: 20 },
    rotation: 0,
    params: { floors: 3, floorHeight: 3, firstFloorHeight: 4 }
  };

  it('centers on the room world footprint with eye-height y and clamped radius', () => {
    const room = { floor: 1, rects: [{ x0: -2, z0: -2, x1: 2, z1: 2 }] };
    const frame = roomInteriorFrame(building, room);
    // no rotation: local center (0,0) → world (10,20)
    expect(frame.center.x).toBeCloseTo(10);
    expect(frame.center.z).toBeCloseTo(20);
    // floor 1 baseY = 0, + floorHeight/2 = 1.5
    expect(frame.center.y).toBeCloseTo(1.5);
    // footprint 4x4 → diagonal/2 ≈ 2.83, clamped up to 6
    expect(frame.radius).toBe(6);
  });

  it('uses the upper floor baseY and a radius from the actual diagonal when large', () => {
    const room = { floor: 2, rects: [{ x0: 0, z0: 0, x1: 20, z1: 20 }] };
    const frame = roomInteriorFrame(building, room);
    // floor 2 baseY = firstFloorHeight (4) + floorHeight/2 (1.5) = 5.5
    expect(frame.center.y).toBeCloseTo(5.5);
    expect(frame.radius).toBeCloseTo(Math.hypot(20, 20) / 2);
  });

  it('returns null for missing inputs or empty rects', () => {
    expect(roomInteriorFrame(null, {})).toBeNull();
    expect(roomInteriorFrame(building, null)).toBeNull();
    expect(roomInteriorFrame(building, { floor: 1, rects: [] })).toBeNull();
  });
});
