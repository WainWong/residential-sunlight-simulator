import { describe, expect, it } from 'vitest';
import { sampleArea } from '../../src/domain/simulation/sampleArea.js';
import { buildOpeningPortals } from '../../src/domain/simulation/buildOpeningPortals.js';

describe('sampleArea transform', () => {
  it('is identity without a transform (unchanged)', () => {
    expect(sampleArea({ cells: [[0, 0]], sampleHeight: 0 })[0].position).toEqual([0.25, 0, 0.25]);
  });
  it('applies a world transform when provided', () => {
    const t = ([x, y, z]) => [x + 10, y + 27, z - 5];
    expect(sampleArea({ cells: [[0, 0]], sampleHeight: 0 }, t)[0].position)
      .toEqual([10.25, 27, -4.75]);
  });
});

describe('buildOpeningPortals', () => {
  const bar = {
    id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
    params: { length: 60, depth: 18, floors: 33, floorHeight: 3 }
  };
  it('builds a world portal on the south wall at the correct floor height', () => {
    const portals = buildOpeningPortals(bar, [{
      id: 'op1', wallId: 'south-0', floor: 9, sillHeight: 0.8, width: 2.4, height: 1.6
    }]);
    expect(portals).toHaveLength(1);
    // floorBaseY(floor=9, fh=3) = 3 + 7*3 = 24; +sill 0.8 => 24.8
    expect(portals[0].bounds.minV).toBeCloseTo(24.8, 6);
    expect(portals[0].plane.normal[2]).toBeCloseTo(-1, 6);
  });
  it('skips openings whose wall cannot be resolved', () => {
    expect(buildOpeningPortals(bar, [{ id: 'x', wallId: 'bogus-9', floor: 1, width: 1, height: 1 }]))
      .toEqual([]);
  });
});
