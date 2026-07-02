import { describe, expect, it } from 'vitest';
import { evaluateDirectSun } from '../../src/domain/simulation/evaluateDirectSun.js';
import { sampleArea } from '../../src/domain/simulation/sampleArea.js';

const area = { cells: [[0, 0]], sampleHeight: 0 };
const southWindow = {
  id: 'window-1',
  type: 'window',
  plane: {
    point: [0, 1.5, -2],
    normal: [0, 0, -1],
    tangent: [1, 0, 0]
  },
  bounds: { minU: -1, maxU: 1, minV: 0.8, maxV: 2.2 }
};
const winterSun = [0, 0.6, -0.8];

describe('observation sampling', () => {
  it('creates four stable samples per square metre', () => {
    expect(sampleArea(area)).toEqual([
      { id: '0:0:0', position: [0.25, 0, 0.25] },
      { id: '0:0:1', position: [0.75, 0, 0.25] },
      { id: '0:0:2', position: [0.25, 0, 0.75] },
      { id: '0:0:3', position: [0.75, 0, 0.75] }
    ]);
  });
});

describe('direct sunlight', () => {
  it('lights samples that pass through an opening', () => {
    const result = evaluateDirectSun({
      area,
      openings: [southWindow],
      obstacles: [],
      sunDirection: winterSun
    });

    expect(result.hasDirectSun).toBe(true);
    expect(result.litRatio).toBe(1);
    expect(result.openingHits['window-1']).toBe(4);
  });

  it('blocks samples behind another building', () => {
    const result = evaluateDirectSun({
      area,
      openings: [southWindow],
      obstacles: [{ id: 'blocker', min: [-3, 0, -20], max: [3, 20, -5] }],
      sunDirection: winterSun
    });

    expect(result.hasDirectSun).toBe(false);
    expect(result.litRatio).toBe(0);
  });

  it('uses the opening intersected by the ray', () => {
    const offsetWindow = {
      ...southWindow,
      id: 'window-2',
      bounds: { minU: 4, maxU: 6, minV: 0.8, maxV: 2.2 }
    };

    const result = evaluateDirectSun({
      area,
      openings: [offsetWindow, southWindow],
      obstacles: [],
      sunDirection: winterSun
    });

    expect(result.hasDirectSun).toBe(true);
    expect(result.openingHits['window-2']).toBe(0);
    expect(result.openingHits['window-1']).toBe(4);
  });

  it('returns no direct sun below the horizon', () => {
    const result = evaluateDirectSun({
      area,
      openings: [southWindow],
      obstacles: [],
      sunDirection: [0, -0.2, -0.98]
    });

    expect(result).toMatchObject({ hasDirectSun: false, litRatio: 0 });
  });
});

