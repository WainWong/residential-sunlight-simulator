import { describe, expect, it } from 'vitest';
import { floorFocusTarget } from '../../src/scene/floorFocus.js';

const bar = { id: 'b1', template: 'bar', position: { x: 10, z: -4 }, rotation: 0,
  params: { length: 60, depth: 18, floors: 5, floorHeight: 3 } };

describe('floorFocus', () => {
  it('targets the selected floor base at the building position', () => {
    const { target } = floorFocusTarget(bar, 3);
    expect(target).toEqual({ x: 10, y: 6, z: -4 });
  });
});
