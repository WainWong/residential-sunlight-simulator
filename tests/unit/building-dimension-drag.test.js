import { describe, expect, it } from 'vitest';
import { applyDimensionControl } from '../../src/domain/buildings/buildingTypes.js';
import { worldPointToBuildingLocal } from '../../src/domain/buildings/buildingCoordinates.js';
import { resizeBuildingFromGroundPoint } from '../../src/scene/gizmos/createBuildingGestures.js';

describe('building dimension drag coordinates', () => {
  it.each([
    [0, { x: 12, z: 8 }, { x: 2, z: 3 }],
    [90, { x: 10, z: -7 }, { x: 12, z: 0 }],
    [270, { x: 10, z: 17 }, { x: 12, z: 0 }]
  ])('converts world points into local coordinates at %s degrees',
    (rotation, point, expected) => {
      const actual = worldPointToBuildingLocal({
        position: { x: 10, z: 5 }, rotation
      }, point);
      expect(actual.x).toBeCloseTo(expected.x);
      expect(actual.z).toBeCloseTo(expected.z);
    });

  it('uses the local point to update one L-shape segment', () => {
    const startParams = {
      length: 60, depth: 40, wingLength: 18, wingDepth: 16
    };
    const building = { position: { x: 10, z: 5 }, rotation: 90 };
    const pointerLocal = worldPointToBuildingLocal(building, { x: 10, z: 0 });

    expect(applyDimensionControl({
      templateId: 'lShape',
      controlId: 'l-inner-vertical',
      startParams,
      pointerLocal
    })).toEqual({
      length: 60, depth: 40, wingLength: 35, wingDepth: 16
    });
  });
});

  it('delegates a rotated world-space drag through its semantic control id', () => {
    const building = {
      id: 'l1', template: 'lShape',
      position: { x: 10, z: 5 }, rotation: 90,
      params: { length: 60, depth: 40, wingLength: 18, wingDepth: 16 }
    };

    expect(resizeBuildingFromGroundPoint(
      building,
      { type: 'resize', controlId: 'l-inner-vertical', axis: 'x' },
      { x: 10, z: 0 }
    )).toEqual({
      length: 60, depth: 40, wingLength: 35, wingDepth: 16
    });
  });
