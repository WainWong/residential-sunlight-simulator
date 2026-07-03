import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { migrateProject } from '../../src/domain/project/migrateProject.js';
import { validateProject } from '../../src/domain/project/validateProject.js';

function validBar(overrides = {}) {
  return {
    id: 'building-a',
    name: '建筑 A',
    template: 'bar',
    position: { x: 0, z: 0 },
    rotation: 0,
    params: {
      length: 60,
      depth: 18,
      floors: 33,
      floorHeight: 3
    },
    observationAreas: [],
    openings: [],
    ...overrides
  };
}

describe('project schema', () => {
  it('creates a valid version-one project', () => {
    const project = createDefaultProject();

    expect(project.schemaVersion).toBe(1);
    expect(project.location.timeZone).toBe('Asia/Shanghai');
    expect(validateProject(project)).toEqual({ ok: true, errors: [] });
  });

  it('reports the building name and invalid field', () => {
    const project = createDefaultProject();
    project.buildings.push(validBar({
      params: { length: 60, depth: 18, floors: 0, floorHeight: 3 }
    }));

    const result = validateProject(project);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('建筑 A');
    expect(result.errors[0]).toContain('楼层数');
  });

  it('rejects duplicate entity ids and unsupported types', () => {
    const project = createDefaultProject();
    project.buildings.push(validBar(), validBar({ name: '建筑 B', template: 'tower' }));

    const result = validateProject(project);

    expect(result.errors).toContain('建筑 ID 不能重复：building-a');
    expect(result.errors).toContain('建筑 B 的建筑模板不受支持');
  });

  it('clones valid version-one projects during migration', () => {
    const project = createDefaultProject();
    const migrated = migrateProject(project);

    expect(migrated).toEqual(project);
    expect(migrated).not.toBe(project);
  });

  it('rejects future project versions', () => {
    expect(() => migrateProject({ schemaVersion: 2 }))
      .toThrow('不支持的项目版本：2');
  });
});
