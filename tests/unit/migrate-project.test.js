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
    expect(area.name).toBe('客厅');
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

describe('migrateProject areaTool and areaDraft', () => {
  it('normalizes a legacy move tool to draw and ensures areaDraft', () => {
    const migrated = migrateProject({
      schemaVersion: 1, buildings: [],
      view: { areaTool: 'move' }
    });
    expect(migrated.view.areaTool).toBe('draw');
    expect(migrated.view.areaDraft).toBeNull();
  });

  it('keeps a valid area tool and existing areaDraft untouched', () => {
    const migrated = migrateProject({
      schemaVersion: 1, buildings: [],
      view: { areaTool: 'erase', areaDraft: null }
    });
    expect(migrated.view.areaTool).toBe('erase');
  });
});
