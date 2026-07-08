import { describe, expect, it } from 'vitest';
import { rectsToSamplePoints } from '../../src/domain/simulation/rectsToSamplePoints.js';

describe('rectsToSamplePoints', () => {
  it('places one centre per 1m cell over a 2x1 rect', () => {
    const pts = rectsToSamplePoints([{ x0: 0, z0: 0, x1: 2, z1: 1 }], 1, 0);
    expect(pts.map(p => p.position)).toEqual([[0.5, 0, 0.5], [1.5, 0, 0.5]]);
  });

  it('handles unordered corners', () => {
    const pts = rectsToSamplePoints([{ x0: 2, z0: 1, x1: 0, z1: 0 }], 1, 0);
    expect(pts.map(p => p.position)).toEqual([[0.5, 0, 0.5], [1.5, 0, 0.5]]);
  });

  it('applies sampleHeight to y', () => {
    const pts = rectsToSamplePoints([{ x0: 0, z0: 0, x1: 1, z1: 1 }], 1, 1.2);
    expect(pts[0].position).toEqual([0.5, 1.2, 0.5]);
  });

  it('dedupes overlapping rects by grid cell', () => {
    const pts = rectsToSamplePoints(
      [{ x0: 0, z0: 0, x1: 2, z1: 1 }, { x0: 1, z0: 0, x1: 3, z1: 1 }], 1, 0
    );
    expect(pts.map(p => p.position)).toEqual([[0.5, 0, 0.5], [1.5, 0, 0.5], [2.5, 0, 0.5]]);
  });

  it('returns [] for empty rects', () => {
    expect(rectsToSamplePoints([], 1, 0)).toEqual([]);
  });
});
