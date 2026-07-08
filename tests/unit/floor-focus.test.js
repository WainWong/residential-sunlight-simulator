import { describe, expect, it } from 'vitest';
import { floorFocusTarget, floorVisibility, createWallOutline } from '../../src/scene/floorFocus.js';

const bar = { id: 'b1', template: 'bar', position: { x: 10, z: -4 }, rotation: 0,
  params: { length: 60, depth: 18, floors: 5, floorHeight: 3 } };

describe('floorFocus', () => {
  it('targets the selected floor height above the building position', () => {
    const { target, height } = floorFocusTarget(bar, 3);
    expect(target).toEqual({ x: 10, y: 6, z: -4 });
    expect(height).toBeGreaterThan(60);
  });
  it('hides every building while focused', () => {
    const vis = floorVisibility();
    expect(vis('b1')).toBe(false);
    expect(vis('b2')).toBe(false);
  });
  it('builds a wall outline group positioned at the building', () => {
    const group = createWallOutline(bar, 3);
    expect(group.userData.kind).toBe('wall-outline');
    expect(group.children.length).toBeGreaterThan(0);
    expect(group.position.x).toBe(bar.position.x);
    expect(group.position.z).toBe(bar.position.z);
  });
});
