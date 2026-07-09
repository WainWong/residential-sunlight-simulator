import { describe, expect, it } from 'vitest';
import { migrateProject } from '../../src/domain/project/migrateProject.js';

describe('migrateProject cells->rects', () => {
  it('drops legacy cells/openingIds and ensures rects', () => {
    const raw = {
      schemaVersion: 1,
      buildings: [{
        id: 'b1',
        observationAreas: [{ id: 'a1', name: '客厅', floor: 1, cells: [[0, 0], [1, 0]], openingIds: ['o1'] }]
      }]
    };
    const out = migrateProject(raw);
    const area = out.buildings[0].observationAreas[0];
    expect(area.cells).toBeUndefined();
    expect(area.openingIds).toBeUndefined();
    expect(area.rects).toEqual([]);
    expect(area.name).toBeUndefined();
  });

  it('keeps existing rects untouched', () => {
    const raw = {
      schemaVersion: 1,
      buildings: [{ id: 'b1', observationAreas: [{ id: 'a1', floor: 1, rects: [{ x0: 0, z0: 0, x1: 2, z1: 1 }] }] }]
    };
    const out = migrateProject(raw);
    expect(out.buildings[0].observationAreas[0].rects).toEqual([{ x0: 0, z0: 0, x1: 2, z1: 1 }]);
  });

  it('still rejects unsupported versions', () => {
    expect(() => migrateProject({ schemaVersion: 2 })).toThrow();
  });
});

describe('migrateProject areaDraft and areaTool cleanup', () => {
  it('drops a stale areaDraft and areaTool and ensures areaEditing is null', () => {
    const migrated = migrateProject({
      schemaVersion: 1, buildings: [],
      view: { areaDraft: { buildingId: 'b1', areaId: 'a1', rects: [] }, areaTool: 'erase' }
    });
    expect(migrated.view.areaEditing).toBeNull();
    expect(migrated.view.areaDraft).toBeUndefined();
    expect(migrated.view.areaTool).toBeUndefined();
  });
});

describe('migrateProject phase and name cleanup', () => {
  it('drops legacy area.name and ensures view.phase is edit', () => {
    const raw = {
      schemaVersion: 1,
      buildings: [{
        id: 'b1',
        observationAreas: [{ id: 'a1', name: '客厅', floor: 1, rects: [] }]
      }],
      view: { selectedBuildingId: null, editorMode: 'none' }
    };
    const out = migrateProject(raw);
    expect(out.buildings[0].observationAreas[0].name).toBeUndefined();
    expect(out.view.phase).toBe('edit');
  });

  it('preserves an explicit present phase', () => {
    const out = migrateProject({ schemaVersion: 1, buildings: [], view: { phase: 'present' } });
    expect(out.view.phase).toBe('present');
  });
});
