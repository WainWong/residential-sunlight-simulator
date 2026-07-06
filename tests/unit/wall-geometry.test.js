import { describe, expect, it } from 'vitest';
import {
  rotateLocalToWorld,
  worldWallSegments,
  resolveWallId,
  resolveWallPlane
} from '../../src/domain/buildings/wallGeometry.js';

const bar = {
  id: 'b1', template: 'bar', rotation: 0,
  position: { x: 0, z: 0 },
  params: { length: 60, depth: 18, floors: 33, floorHeight: 3 }
};

describe('wallGeometry', () => {
  it('rotates local to world about Y (90° sends +X to -Z)', () => {
    const [x, z] = rotateLocalToWorld([1, 0], 90);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(-1, 6);
  });

  it('resolves legacy south-0 to the wall whose outward normal points south (+? -Z)', () => {
    // bar footprint: wall-outer-0 start[-30,-9] end[30,-9] normal[0,-1] => 南(-Z)
    expect(resolveWallId(bar, 'south-0')).toBe('wall-outer-0');
    expect(resolveWallId(bar, 'wall-outer-2')).toBe('wall-outer-2');
  });

  it('tracks rotation: after 180°, south-facing wall flips world normal to +Z', () => {
    const plane0 = resolveWallPlane(bar, 'south-0', { baseY: 24, height: 1.6, width: 2.4 });
    const rotated = { ...bar, rotation: 180 };
    const plane180 = resolveWallPlane(rotated, 'south-0', { baseY: 24, height: 1.6, width: 2.4 });
    expect(plane0.normal[2]).toBeCloseTo(-1, 6);
    expect(plane180.normal[2]).toBeCloseTo(1, 6);
    expect(plane0.bounds).toEqual({ minU: -1.2, maxU: 1.2, minV: 24, maxV: 25.6 });
  });

  it('builds world wall segments translated by position', () => {
    const shifted = { ...bar, position: { x: 10, z: 5 } };
    const walls = worldWallSegments(shifted);
    expect(walls).toHaveLength(4);
    expect(walls[0].start).toEqual([-20, -4]); // [-30,-9] + [10,5]
  });
});
