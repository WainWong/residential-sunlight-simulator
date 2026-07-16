import { describe, expect, it } from 'vitest';
import {
  createBuildingRotationGuide,
  rotationDirectionLabel,
  updateBuildingRotationGuide
} from '../../src/scene/gizmos/buildingRotationGuide.js';
import { outwardLabelOffset } from '../../src/scene/gizmos/createBuildingGestures.js';

describe('building rotation guide', () => {
  it('formats the radial arrow as a compass bearing', () => {
    const center = { x: 0, z: 0 };
    expect(rotationDirectionLabel(center, { x: 0, z: 1 })).toBe('正北 0°');
    expect(rotationDirectionLabel(center, { x: 1, z: 1 })).toBe('东北 45°');
    expect(rotationDirectionLabel(center, { x: 1, z: 0 })).toBe('正东 90°');
    expect(rotationDirectionLabel(center, { x: -1, z: -1 })).toBe('西南 225°');
  });

  it('extends a visible radial arrow beyond the pointer', () => {
    const guide = createBuildingRotationGuide();
    updateBuildingRotationGuide(guide, { x: 2, z: 3 }, { x: 2, z: 13 });
    const arrow = guide.getObjectByName('building-rotation-guide-arrow');
    const shaft = guide.getObjectByName('building-rotation-guide-shaft');

    expect(guide.visible).toBe(true);
    expect(shaft.scale.y).toBeGreaterThan(10);
    expect(arrow.position.z).toBeGreaterThan(13);
    expect(arrow.material.depthTest).toBe(false);

    guide.userData.dispose();
  });

  it('places the direction label outward from the drag point', () => {
    expect(outwardLabelOffset({ x: 100, y: 100 }, { x: 130, y: 140 }, 24))
      .toEqual({ x: 144.4, y: 159.2 });
  });
});
