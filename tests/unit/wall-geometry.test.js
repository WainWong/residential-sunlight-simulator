import { describe, expect, it } from 'vitest';
import {
  rotateLocalToWorld,
  worldWallSegments
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

  it('builds world wall segments translated by position', () => {
    const shifted = { ...bar, position: { x: 10, z: 5 } };
    const walls = worldWallSegments(shifted);
    expect(walls).toHaveLength(4);
    expect(walls[0].start).toEqual([-20, -4]); // [-30,-9] + [10,5]
  });
});
