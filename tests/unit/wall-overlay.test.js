import { describe, expect, it } from 'vitest';
import { createWallOverlay, wallCameraPose } from '../../src/scene/wallOverlay.js';

const building = {
  id: 'b1', position: { x: 10, z: 20 }, rotation: 0,
  params: { length: 10, depth: 8, floors: 2, floorHeight: 3 }
};
const wall = {
  id: 'wall:1:test', floor: 1, start: [-5, -4], end: [5, -4],
  normal: [0, -1], length: 10, roomIds: ['r1'], kind: 'exterior'
};

describe('wall overlay', () => {
  it('creates a restrained wall highlight and click marker', () => {
    const overlay = createWallOverlay(building, wall, { centerU: 0.25, selected: true });
    expect(overlay.userData.kind).toBe('wall-overlay');
    expect(overlay.children.some(child => child.userData.kind === 'wall-click-marker')).toBe(true);
    expect(overlay.position.x).toBe(10);
    expect(overlay.position.z).toBe(20);
  });

  it('places the camera in front of the clicked wall while preserving its center', () => {
    const pose = wallCameraPose(building, wall);
    expect(pose.target).toMatchObject({ x: 10, y: 1.5, z: 16 });
    expect(pose.position.z).toBeLessThan(pose.target.z);
    expect(pose.position.y).toBeCloseTo(pose.target.y);
  });
});
