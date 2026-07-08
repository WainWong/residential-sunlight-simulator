import { describe, expect, it } from 'vitest';
import { deriveAperturesFromArea } from '../../src/domain/simulation/deriveApertures.js';

const bar = {
  id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
  params: { length: 60, depth: 18, floors: 3, floorHeight: 3 }
};
// bar footprint: x∈[-30,30], z∈[-9,9]; south wall (wall-outer-0) at z=-9, normal [0,-1]

describe('deriveAperturesFromArea', () => {
  it('opens the south wall where a rect crosses z=-9', () => {
    const area = { floor: 1, rects: [{ x0: -2, z0: -11, x1: 2, z1: -5 }] };
    const { portals, apertureWallIds } = deriveAperturesFromArea(bar, area);
    expect(portals).toHaveLength(1);
    expect(portals[0].plane.normal[2]).toBeCloseTo(-1, 6);
    expect(portals[0].bounds.maxU - portals[0].bounds.minU).toBeCloseTo(4, 6);
    expect(portals[0].bounds.minV).toBeCloseTo(0, 6);
    expect([...apertureWallIds]).toContain('b1:wall-outer-0');
  });

  it('no aperture when the rect stays inside, touching no wall', () => {
    const area = { floor: 1, rects: [{ x0: -2, z0: -2, x1: 2, z1: 2 }] };
    const { portals, apertureWallIds } = deriveAperturesFromArea(bar, area);
    expect(portals).toEqual([]);
    expect(apertureWallIds.size).toBe(0);
  });

  it('opens when a rect edge exactly coincides with the wall line', () => {
    const area = { floor: 1, rects: [{ x0: -3, z0: -9, x1: 3, z1: -4 }] };
    const { portals } = deriveAperturesFromArea(bar, area);
    expect(portals).toHaveLength(1);
    expect(portals[0].bounds.maxU - portals[0].bounds.minU).toBeCloseTo(6, 6);
  });

  it('respects floor height for baseY', () => {
    const area = { floor: 3, rects: [{ x0: -2, z0: -11, x1: 2, z1: -5 }] };
    const { portals } = deriveAperturesFromArea(bar, area);
    expect(portals[0].bounds.minV).toBeCloseTo(6, 6);
    expect(portals[0].bounds.maxV).toBeCloseTo(9, 6);
  });
});
