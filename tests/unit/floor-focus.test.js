import { describe, expect, it } from 'vitest';
import { floorFocusTarget, floorVisibility } from '../../src/scene/floorFocus.js';

const bar = { id: 'b1', template: 'bar', position: { x: 10, z: -4 }, rotation: 0,
  params: { length: 60, depth: 18, floors: 5, floorHeight: 3 } };

describe('floorFocus', () => {
  it('targets the selected floor height above the building position', () => {
    const { target, height } = floorFocusTarget(bar, 3);
    expect(target).toEqual({ x: 10, y: 6, z: -4 });
    expect(height).toBeGreaterThan(60);
  });
  it('makes only the selected building visible', () => {
    const vis = floorVisibility([{ id: 'b1' }, { id: 'b2' }], 'b1');
    expect(vis('b1')).toBe(true);
    expect(vis('b2')).toBe(false);
  });
});
