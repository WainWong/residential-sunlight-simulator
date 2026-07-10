import { describe, it, expect } from 'vitest';
import { evaluateInteriorSun } from '../../src/domain/simulation/evaluateInteriorSun.js';

describe('evaluateInteriorSun', () => {
  const surfaces = [
    { surfaceId: 'floor', kind: 'floor', samples: [
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [1, 0, 0] }
    ] }
  ];

  const opening = {
    plane: { normal: [0, 0, -1], point: [0, 2, -3], tangent: [1, 0, 0] },
    bounds: { minU: -50, maxU: 50, minV: 0, maxV: 50 }
  };

  it('returns empty masks when sun is below horizon', () => {
    const { masks } = evaluateInteriorSun({
      surfaces, openings: [opening], obstacles: [], sunDirection: [0, -1, 0]
    });
    expect(masks.floor).toEqual([]);
  });

  it('marks samples lit when a ray passes an opening unobstructed', () => {
    const { masks } = evaluateInteriorSun({
      surfaces, openings: [opening], obstacles: [], sunDirection: [0, 1, -1]
    });
    expect(masks.floor).toEqual(['a', 'b']);
  });
});
