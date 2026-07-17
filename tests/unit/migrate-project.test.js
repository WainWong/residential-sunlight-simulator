import { describe, expect, it } from 'vitest';
import { migrateProject } from '../../src/domain/project/migrateProject.js';
import { buildRoomOpeningPortals } from '../../src/domain/simulation/buildRoomOpeningPortals.js';

function legacyProject(overrides = {}) {
  return {
    schemaVersion: 1,
    buildings: [{
      id: 'b1', name: '住宅 1', template: 'bar', revision: 1,
      position: { x: 0, z: 0 }, rotation: 0,
      params: { length: 20, depth: 10, floors: 2, floorHeight: 3 },
      observationAreas: [{
        id: 'a1', name: '客厅', floor: 1,
        rects: [{ x0: -4, z0: -3, x1: 4, z1: 3 }],
        openingIds: ['o1'], cells: [[0, 0]]
      }],
      openings: [{
        id: 'o1', type: 'window', floor: 1, wallId: 'bar:south',
        width: 2, height: 1.5, sillHeight: 0.9
      }]
    }],
    simulation: { date: '2026-12-21', time: '09:30', activeAreaId: 'a1' },
    view: {
      phase: 'present', selectedBuildingId: 'b1', editorMode: 'areas',
      areaEditing: { mode: 'edit', buildingId: 'b1', areaId: 'a1', floor: 1, rects: [] },
      interior: { buildingId: 'b1', areaId: 'a1' }
    },
    ...overrides
  };
}

describe('migrateProject v1 to v2', () => {
  it('converts observation areas into named rooms without legacy fields', () => {
    const out = migrateProject(legacyProject());
    const room = out.buildings[0].rooms[0];

    expect(out.schemaVersion).toBe(2);
    expect(room).toEqual({
      id: 'a1', floor: 1, name: '客厅',
      rects: [{ x0: -4, z0: -3, x1: 4, z1: 3 }], objects: []
    });
    expect(out.buildings[0].observationAreas).toBeUndefined();
  });

  it('converts legacy openings and preserves a resolvable wall anchor', () => {
    const building = migrateProject(legacyProject()).buildings[0];
    const opening = building.openings[0];
    expect(opening).toMatchObject({
      id: 'o1', floor: 1, connectedRoomIds: ['a1'], preset: 'window',
      bounds: { width: 2, bottom: 0.9, top: 2.4 }, fill: 'glass',
      transmittance: null, status: 'valid'
    });
    expect(opening.wallAnchor.wallId).toMatch(/^wall:1:/);
    expect(buildRoomOpeningPortals(building)).toHaveLength(1);
  });

  it('materializes legacy wall-contact apertures as explicit open openings', () => {
    const project = legacyProject();
    project.buildings[0].observationAreas[0].rects = [
      { x0: -3, z0: -5, x1: 3, z1: -1 }
    ];
    project.buildings[0].observationAreas[0].openingIds = [];
    project.buildings[0].openings = [];

    const building = migrateProject(project).buildings[0];

    expect(building.openings).toHaveLength(1);
    expect(building.openings[0]).toMatchObject({
      id: expect.stringContaining('legacy-aperture:a1:'),
      floor: 1,
      connectedRoomIds: ['a1'],
      preset: 'custom',
      fill: 'open',
      status: 'valid',
      bounds: { centerU: 0.5, width: 6, bottom: 0, top: 3 }
    });
    expect(buildRoomOpeningPortals(building)).toHaveLength(1);
  });

  it('keeps an automatic aperture when the explicit opening on its wall is invalid', () => {
    const project = legacyProject();
    project.buildings[0].observationAreas[0].rects = [
      { x0: -1, z0: -5, x1: 1, z1: -1 }
    ];
    project.buildings[0].openings[0].width = 4;

    const building = migrateProject(project).buildings[0];

    expect(building.openings).toHaveLength(2);
    expect(building.openings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'o1', status: 'invalid' }),
      expect.objectContaining({
        id: expect.stringContaining('legacy-aperture:a1:'),
        preset: 'custom',
        fill: 'open',
        status: 'valid'
      })
    ]));
    expect(buildRoomOpeningPortals(building)).toHaveLength(1);
  });

  it('renames simulation and view task state', () => {
    const out = migrateProject(legacyProject());
    expect(out.simulation.activeRoomId).toBe('a1');
    expect(out.simulation.activeAreaId).toBeUndefined();
    expect(out.view).toMatchObject({
      phase: 'sunlight',
      selection: { kind: 'room', id: 'a1', buildingId: 'b1' },
      roomEditing: null,
      interiorRoomId: 'a1'
    });
    expect(out.view.areaEditing).toBeUndefined();
    expect(out.view.editorMode).toBeUndefined();
    expect(out.view.interior).toBeUndefined();
  });

  it('maps non-present legacy phase to building', () => {
    const out = migrateProject(legacyProject({ view: { phase: 'build' } }));
    expect(out.view.phase).toBe('building');
  });

  it('is idempotent for version-two projects and does not mutate input', () => {
    const first = migrateProject(legacyProject());
    const second = migrateProject(first);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('rejects future project versions', () => {
    expect(() => migrateProject({ schemaVersion: 3 })).toThrow('不支持的项目版本：3');
  });
});

  it('repairs absent courtyard fields in a schema-v2 draft', () => {
    const project = migrateProject(legacyProject());
    project.buildings[0].template = 'courtyard';
    project.buildings[0].params = {
      length: 72,
      depth: 36,
      floors: 2,
      floorHeight: 3
    };

    const migrated = migrateProject(project);

    expect(migrated.buildings[0].params).toEqual({
      length: 72,
      depth: 36,
      courtyardLength: 30,
      courtyardDepth: 16,
      floors: 2,
      floorHeight: 3
    });
  });

  it('does not replace an explicitly invalid courtyard field', () => {
    const project = migrateProject(legacyProject());
    project.buildings[0].template = 'courtyard';
    project.buildings[0].params = {
      length: 72, depth: 36,
      courtyardLength: null, floors: 2, floorHeight: 3
    };

    expect(migrateProject(project).buildings[0].params)
      .toMatchObject({ courtyardLength: null, courtyardDepth: 16 });
  });
