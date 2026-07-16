import { describe, expect, it } from 'vitest';
import {
  applyDimensionControl,
  completeMissingBuildingParams,
  createBuildingParams,
  getBuildingTypeDefinition,
  listBuildingTypeDefinitions,
  normalizeBuildingParams,
  validateBuildingParams
} from '../../src/domain/buildings/buildingTypes.js';

const defaults = {
  bar: { length: 60, depth: 18 },
  lShape: { length: 60, depth: 40, wingLength: 18, wingDepth: 16 },
  courtyard: { length: 60, depth: 40, courtyardLength: 30, courtyardDepth: 16 }
};

function coordinates(footprint) {
  return (Array.isArray(footprint)
    ? footprint
    : [footprint.outer, ...(footprint.holes ?? [])])
    .flat(2);
}

function controlIds(template) {
  const definition = getBuildingTypeDefinition(template);
  return definition.getDimensionControls(defaults[template]).map(control => control.id);
}

function control(template, id) {
  return getBuildingTypeDefinition(template)
    .getDimensionControls(defaults[template])
    .find(item => item.id === id);
}

describe('building type registry', () => {
  it('lists the three supported type definitions', () => {
    expect(listBuildingTypeDefinitions().map(type => type.id))
      .toEqual(['bar', 'lShape', 'courtyard']);
    expect(() => getBuildingTypeDefinition('tower'))
      .toThrow('Unknown building type: tower');
  });

  it('creates destination defaults while preserving non-geometry params', () => {
    expect(createBuildingParams({
      currentParams: {
        length: 70,
        depth: 18,
        floors: 5,
        floorHeight: 3,
        firstFloorHeight: 4.2
      },
      templateId: 'courtyard'
    })).toEqual({
      length: 60,
      depth: 40,
      courtyardLength: 30,
      courtyardDepth: 16,
      floors: 5,
      floorHeight: 3,
      firstFloorHeight: 4.2
    });
  });

  it('fills only absent fields when repairing existing params', () => {
    expect(completeMissingBuildingParams('courtyard', {
      length: 72,
      depth: 36,
      courtyardLength: null,
      floors: 8,
      floorHeight: 3
    })).toEqual({
      length: 72,
      depth: 36,
      courtyardLength: null,
      courtyardDepth: 16,
      floors: 8,
      floorHeight: 3
    });
  });

  it.each(Object.keys(defaults))('%s defaults create a finite footprint', template => {
    const footprint = getBuildingTypeDefinition(template).createFootprint(defaults[template]);
    expect(coordinates(footprint).every(Number.isFinite)).toBe(true);
  });

  it('exposes stable 4/6/8 dimension control ids', () => {
    expect(controlIds('bar')).toEqual([
      'outer-east', 'outer-west', 'outer-north', 'outer-south'
    ]);
    expect(controlIds('lShape')).toEqual([
      'outer-east', 'outer-west', 'outer-north', 'outer-south',
      'l-inner-vertical', 'l-inner-horizontal'
    ]);
    expect(controlIds('courtyard')).toEqual([
      'outer-east', 'outer-west', 'outer-north', 'outer-south',
      'courtyard-east', 'courtyard-west', 'courtyard-north', 'courtyard-south'
    ]);
  });

  it('places every L-shape outer control on a real outer boundary segment', () => {
    expect(Object.fromEntries(
      ['outer-east', 'outer-west', 'outer-north', 'outer-south'].map(id => [
        id, control('lShape', id).anchor(defaults.lShape)
      ])
    )).toEqual({
      'outer-east': { x: 30, z: -12 },
      'outer-west': { x: -30, z: 0 },
      'outer-north': { x: -21, z: 20 },
      'outer-south': { x: 0, z: -20 }
    });
  });

  it('places and applies the L-shape inner vertical control', () => {
    expect(control('lShape', 'l-inner-vertical').anchor(defaults.lShape))
      .toEqual({ x: -12, z: 8 });

    expect(applyDimensionControl({
      templateId: 'lShape',
      controlId: 'l-inner-vertical',
      startParams: defaults.lShape,
      pointerLocal: { x: -5, z: 0 }
    })).toEqual({
      length: 60,
      depth: 40,
      wingLength: 25,
      wingDepth: 16
    });
  });

  it('clamps inner controls before an L notch or courtyard wall collapses', () => {
    expect(applyDimensionControl({
      templateId: 'lShape',
      controlId: 'l-inner-horizontal',
      startParams: defaults.lShape,
      pointerLocal: { x: 0, z: 100 }
    }).wingDepth).toBe(38);

    expect(applyDimensionControl({
      templateId: 'courtyard',
      controlId: 'courtyard-east',
      startParams: defaults.courtyard,
      pointerLocal: { x: 100, z: 0 }
    }).courtyardLength).toBe(56);
  });

  it('normalizes dependent geometry and reports invalid explicit params', () => {
    expect(normalizeBuildingParams('lShape', {
      length: 20,
      depth: 20,
      wingLength: 30,
      wingDepth: 0
    })).toEqual({
      length: 20,
      depth: 20,
      wingLength: 18,
      wingDepth: 2
    });

    expect(validateBuildingParams('courtyard', {
      length: 20,
      depth: 20,
      courtyardLength: 18,
      courtyardDepth: 10
    })).not.toEqual([]);
  });
});
