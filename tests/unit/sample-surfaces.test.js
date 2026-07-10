import { describe, it, expect } from 'vitest';
import { sampleSurfaces } from '../../src/domain/simulation/sampleSurfaces.js';

const identity = p => p;

describe('sampleSurfaces', () => {
  const area = { rects: [{ x0: 0, z0: 0, x1: 4, z1: 4 }], sampleHeight: 0 };

  it('produces a floor surface with grid samples', () => {
    const { surfaces } = sampleSurfaces(area, { floorHeight: 3 }, identity);
    const floor = surfaces.find(s => s.kind === 'floor');
    expect(floor).toBeTruthy();
    expect(floor.surfaceId).toBe('floor');
    expect(floor.samples.length).toBeGreaterThan(0);
    for (const s of floor.samples) {
      expect(s.u).toBeGreaterThanOrEqual(0);
      expect(s.u).toBeLessThanOrEqual(1);
      expect(s.v).toBeGreaterThanOrEqual(0);
      expect(s.v).toBeLessThanOrEqual(1);
    }
  });

  it('produces wall surfaces reaching floorHeight', () => {
    const { surfaces } = sampleSurfaces(area, { floorHeight: 3 }, identity);
    const walls = surfaces.filter(s => s.kind === 'wall');
    expect(walls.length).toBe(4);
    const maxY = Math.max(...walls.flatMap(w => w.samples.map(s => s.position[1])));
    expect(maxY).toBeGreaterThan(0);
    expect(maxY).toBeLessThanOrEqual(3);
  });

  it('applies the transform to sample positions', () => {
    const shift = ([x, y, z]) => [x + 100, y, z];
    const { surfaces } = sampleSurfaces(area, { floorHeight: 3 }, shift);
    const floor = surfaces.find(s => s.kind === 'floor');
    expect(floor.samples.every(s => s.position[0] >= 100)).toBe(true);
  });
});
