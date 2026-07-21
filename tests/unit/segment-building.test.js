import { describe, expect, it } from 'vitest';
import {
  buildSegmentSpecs, SLAB_THICKNESS, OPENING_CUT_EXTENSION
} from '../../src/domain/buildings/segmentBuilding.js';

const bar = (areas = []) => ({
  id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
  params: { length: 60, depth: 18, floors: 6, floorHeight: 3 },
  rooms: areas
});
// bar footprint: x ∈ [-30, 30], z ∈ [-9, 9](createFootprint 以中心为原点)
const S = SLAB_THICKNESS;

// 每层都切成一个 band(逐层切分,使空楼也能按层揭盖):楼层 f 的实体段为
// [base(f)+SLAB, base(f+1)],其下夹一层楼板段 [base(f), base(f)+SLAB]。
function occupiedBand(specs, floor) {
  const base = (floor - 1) * 3;
  return specs.find(s => Math.abs(s.fromY - (base + S)) < 1e-9);
}

describe('buildSegmentSpecs', () => {
  it('empty building still splits per floor (so every floor can be un-lidded)', () => {
    const specs = buildSegmentSpecs(bar());
    // 6 层 → 6 楼板夹层 + 6 楼层实体段,交替叠放
    expect(specs.map(s => [s.fromY, s.toY])).toEqual([
      [0, S], [S, 3],
      [3, 3 + S], [3 + S, 6],
      [6, 6 + S], [6 + S, 9],
      [9, 9 + S], [9 + S, 12],
      [12, 12 + S], [12 + S, 15],
      [15, 15 + S], [15 + S, 18]
    ]);
    expect(specs.every(s => s.cutters.length === 0)).toBe(true);
  });

  it('carves the occupied floor band with a cutter, others stay solid', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]));
    const band = occupiedBand(specs, 2);
    expect([band.fromY, band.toY]).toEqual([3 + S, 6]);
    expect(band.cutters).toHaveLength(1);
    // every other band is solid
    expect(specs.filter(s => s !== band).every(s => s.cutters.length === 0)).toBe(true);
  });

  it('bumps opening edges outward, keeps interior edges in place', () => {
    // 观察区南边贴在 footprint 南墙上 (z = -9),其余三边在楼内部
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -9, x1: 8, z1: 0 }] }
    ]));
    const cutter = occupiedBand(specs, 2).cutters[0];
    const zs = cutter.outer.map(p => p.z);
    // 贴墙边被推到墙外(南 = -z 方向)
    expect(Math.min(...zs)).toBeCloseTo(-9 - OPENING_CUT_EXTENSION, 6);
    // 内部边纹丝不动
    expect(Math.max(...zs)).toBeCloseTo(0, 6);
    expect(Math.min(...cutter.outer.map(p => p.x))).toBeCloseTo(-8, 6);
    expect(Math.max(...cutter.outer.map(p => p.x))).toBeCloseTo(8, 6);
  });

  it('top-floor band ends at the building top', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 6, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]));
    const band = occupiedBand(specs, 6);
    expect([band.fromY, band.toY]).toEqual([15 + S, 18]);
    expect(band.cutters).toHaveLength(1);
    // it is the last spec (nothing above the top floor)
    expect(specs[specs.length - 1]).toBe(band);
  });

  it('carves each occupied floor independently', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] },
      { id: 'a2', floor: 4, rects: [{ x0: 10, z0: -6, x1: 20, z1: 6 }] }
    ]));
    expect(occupiedBand(specs, 2).cutters).toHaveLength(1);
    expect(occupiedBand(specs, 4).cutters).toHaveLength(1);
    expect(occupiedBand(specs, 3).cutters).toHaveLength(0);
  });

  it('same-floor areas share one band with two cutters', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: -2, z1: 6 }] },
      { id: 'a2', floor: 2, rects: [{ x0: 2, z0: -6, x1: 8, z1: 6 }] }
    ]));
    expect(occupiedBand(specs, 2).cutters).toHaveLength(2);
  });
});
