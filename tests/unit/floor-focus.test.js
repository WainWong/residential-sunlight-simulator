import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as floorFocus from '../../src/scene/floorFocus.js';

const bar = { id: 'b1', template: 'bar', position: { x: 10, z: -4 }, rotation: 0,
  params: { length: 60, depth: 18, floors: 5, floorHeight: 3 } };

function buildingGroup(id, segments) {
  const group = new THREE.Group();
  group.userData.entityId = id;
  for (const segment of segments) {
    const child = new THREE.Group();
    child.userData = segment;
    group.add(child);
  }
  return group;
}

describe('floorFocus', () => {
  it('targets the selected floor base at the building position', () => {
    const { target } = floorFocus.floorFocusTarget(bar, 3);
    expect(target).toEqual({ x: 10, y: 6, z: -4 });
  });
  it('keeps lower floors and other buildings visible while hiding the active floor lid and above', () => {
    const root = new THREE.Group();
    const active = buildingGroup('b1', [
      { kind: 'building-segment', fromY: 0 },
      { kind: 'building-segment', fromY: 3 },
      { kind: 'building-lid', fromY: 5.85 },
      { kind: 'building-segment', fromY: 6 },
      { kind: 'room-floor', floor: 1 },
      { kind: 'room-floor', floor: 2 },
      { kind: 'room-wall', floor: 3 },
      { kind: 'opening-glass', floor: 2 },
      { kind: 'floor-lines' }
    ]);
    const other = buildingGroup('b2', [
      { kind: 'building-segment', fromY: 0 },
      { kind: 'building-segment', fromY: 6 }
    ]);
    root.add(active, other);

    floorFocus.setFloorFocusVisibility(root, 'b1', 2, 6);

    expect(active.children.map(child => child.visible)).toEqual([
      true, true, false, false, true, false, false, false, false
    ]);
    expect(other.visible).toBe(true);
    expect(other.children.every(child => child.visible)).toBe(true);

    floorFocus.restoreBuildingVisibility(root);

    expect(active.children.every(child => child.visible)).toBe(true);
  });

  it('ceiling modes: hide removes the lid, show/ghost keep it visible', () => {
    const mk = () => buildingGroup('b1', [
      { kind: 'building-segment', fromY: 0 },
      { kind: 'building-lid', fromY: 5.85 },
      { kind: 'building-segment', fromY: 6 }
    ]);
    const lidVisibility = ceiling => {
      const root = new THREE.Group();
      const b = mk();
      root.add(b);
      floorFocus.setFloorFocusVisibility(root, 'b1', 2, 6, ceiling);
      // children[1] = lid, children[2] = segment above the band
      return [b.children[1].visible, b.children[2].visible];
    };
    expect(lidVisibility('hide')).toEqual([false, false]);
    expect(lidVisibility('ghost')).toEqual([true, true]);
    expect(lidVisibility('show')).toEqual([true, true]);
  });
});
