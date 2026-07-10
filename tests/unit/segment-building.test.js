import { describe, expect, it } from 'vitest';
import {
  buildSegmentSpecs, SLAB_THICKNESS, OPENING_CUT_EXTENSION
} from '../../src/domain/buildings/segmentBuilding.js';

const bar = (areas = []) => ({
  id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
  params: { length: 60, depth: 18, floors: 6, floorHeight: 3 },
  observationAreas: areas
});
// bar footprint: x ∈ [-30, 30], z ∈ [-9, 9](createFootprint 以中心为原点)

describe('buildSegmentSpecs', () => {
  it('building without areas yields one full-height segment, no cutters', () => {
    const specs = buildSegmentSpecs(bar());
    expect(specs).toEqual([{ fromY: 0, toY: 18, cutters: [], rooms: [] }]);
  });

  it('splits into below / band / above around the occupied floor', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]));
    // floor 2: baseY = 3, next floor base = 6
    expect(specs.map(s => [s.fromY, s.toY])).toEqual([
      [0, 3 + SLAB_THICKNESS], [3 + SLAB_THICKNESS, 6], [6, 18]
    ]);
    expect(specs[0].cutters).toEqual([]);
    expect(specs[1].cutters).toHaveLength(1);
    expect(specs[2].cutters).toEqual([]);
  });

  it('bumps opening edges outward, keeps interior edges in place', () => {
    // 观察区南边贴在 footprint 南墙上 (z = -9),其余三边在楼内部
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -9, x1: 8, z1: 0 }] }
    ]));
    const cutter = specs[1].cutters[0];
    const zs = cutter.outer.map(p => p.z);
    // 贴墙边被推到墙外(南 = -z 方向)
    expect(Math.min(...zs)).toBeCloseTo(-9 - OPENING_CUT_EXTENSION, 6);
    // 内部边纹丝不动
    expect(Math.max(...zs)).toBeCloseTo(0, 6);
    expect(Math.min(...cutter.outer.map(p => p.x))).toBeCloseTo(-8, 6);
    expect(Math.max(...cutter.outer.map(p => p.x))).toBeCloseTo(8, 6);
    // 原始贴墙边随刀带出,供洞口描边使用
    expect(cutter.openingEdges).toHaveLength(1);
    expect(cutter.openingEdges[0].a.z).toBeCloseTo(-9, 6);
    expect(cutter.openingEdges[0].b.z).toBeCloseTo(-9, 6);
  });

  it('top-floor area band ends at building top', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 6, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]));
    // floor 6: baseY = 15, 顶 = 18 → 上段不存在
    expect(specs.map(s => [s.fromY, s.toY])).toEqual([
      [0, 15 + SLAB_THICKNESS], [15 + SLAB_THICKNESS, 18]
    ]);
  });

  it('two areas on different floors yield five segments', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] },
      { id: 'a2', floor: 4, rects: [{ x0: 10, z0: -6, x1: 20, z1: 6 }] }
    ]));
    expect(specs.map(s => [s.fromY, s.toY])).toEqual([
      [0, 3 + SLAB_THICKNESS], [3 + SLAB_THICKNESS, 6],
      [6, 9 + SLAB_THICKNESS], [9 + SLAB_THICKNESS, 12], [12, 18]
    ]);
  });

  it('same-floor areas share one band with two cutters', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: -2, z1: 6 }] },
      { id: 'a2', floor: 2, rects: [{ x0: 2, z0: -6, x1: 8, z1: 6 }] }
    ]));
    expect(specs).toHaveLength(3);
    expect(specs[1].cutters).toHaveLength(2);
  });
});
