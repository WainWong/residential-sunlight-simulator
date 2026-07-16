import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { migrateProject } from '../../src/domain/project/migrateProject.js';
import { validateProject } from '../../src/domain/project/validateProject.js';

function validBar(overrides = {}) {
  return {
    id: 'building-a', name: '建筑 A', template: 'bar', revision: 1,
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 60, depth: 18, floors: 33, floorHeight: 3 },
    rooms: [], openings: [], ...overrides
  };
}

describe('project schema', () => {
  it('creates a valid version-two room-first project', () => {
    const project = createDefaultProject();
    expect(project.schemaVersion).toBe(2);
    expect(project.location.timeZone).toBe('Asia/Shanghai');
    expect(project.simulation).toHaveProperty('activeRoomId', null);
    expect(project.view).toMatchObject({
      phase: 'build', selection: null, roomEditing: null, interiorRoomId: null
    });
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

  it('rejects duplicate entity ids and unsupported room and opening values', () => {
    const project = createDefaultProject();
    project.buildings.push(validBar({
      rooms: [{ id: 'r1', floor: 1, name: '客厅', type: 'garage', rects: [], objects: [] }],
      openings: [{
        id: 'o1', floor: 1, connectedRoomIds: ['r1'], wallAnchor: {},
        preset: 'arch', bounds: { centerU: 0.5, width: 2, bottom: 0, top: 2 },
        fill: 'open', transmittance: null
      }]
    }), validBar({ name: '建筑 B', template: 'tower' }));
    const result = validateProject(project);
    expect(result.errors).toContain('建筑 ID 不能重复：building-a');
    expect(result.errors).toContain('建筑 B 的建筑模板不受支持');
    expect(result.errors.some(error => error.includes('房间类型'))).toBe(true);
    expect(result.errors.some(error => error.includes('开口预设'))).toBe(true);
  });

  it('rejects malformed room coordinates without deriving walls from them', () => {
    const project = createDefaultProject();
    project.buildings.push(validBar({
      rooms: [{
        id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
        rects: [{ x0: 'bad', z0: 0, x1: 2, z1: 2 }]
      }]
    }));

    const result = validateProject(project);

    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.includes('房间轮廓'))).toBe(true);
  });

  it('rejects valid openings whose wall anchor cannot be resolved', () => {
    const project = createDefaultProject();
    project.buildings.push(validBar({
      rooms: [{
        id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
        rects: [{ x0: -4, z0: -9, x1: 4, z1: 3 }]
      }],
      openings: [{
        id: 'o1', floor: 1, connectedRoomIds: ['r1'],
        wallAnchor: { wallId: 'wall:missing', centerU: 0.5 },
        preset: 'window',
        bounds: { centerU: 0.5, width: 2, bottom: 0.8, top: 2.2 },
        fill: 'glass', transmittance: null, status: 'valid'
      }]
    }));

    const result = validateProject(project);

    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.includes('墙锚点'))).toBe(true);
  });

  it('accepts an unresolved invalid opening for repair after import', () => {
    const project = createDefaultProject();
    project.buildings.push(validBar({
      rooms: [{
        id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
        rects: [{ x0: -4, z0: -9, x1: 4, z1: 3 }]
      }],
      openings: [{
        id: 'o1', floor: 1, connectedRoomIds: [],
        wallAnchor: { wallId: null, centerU: 0.5 },
        preset: 'window',
        bounds: { centerU: 0.5, width: 2, bottom: 0.8, top: 2.2 },
        fill: 'glass',
        transmittance: null,
        status: 'invalid'
      }]
    }));

    expect(validateProject(project)).toEqual({ ok: true, errors: [] });
  });

  it('rejects disconnected room geometry', () => {
    const project = createDefaultProject();
    project.buildings.push(validBar({
      rooms: [{
        id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
        rects: [
          { x0: -20, z0: -2, x1: -10, z1: 2 },
          { x0: 10, z0: -2, x1: 20, z1: 2 }
        ]
      }]
    }));

    const result = validateProject(project);

    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.includes('房间几何'))).toBe(true);
  });

  it('rejects malformed opening references, bounds, and status', () => {
    const project = createDefaultProject();
    const building = validBar({
      rooms: [{
        id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
        rects: [{ x0: -4, z0: -9, x1: 4, z1: 3 }]
      }]
    });
    building.openings = [{
      id: 'o1', floor: 1, connectedRoomIds: ['missing'],
      wallAnchor: { wallId: 'wall:missing', centerU: 2 },
      preset: 'window',
      bounds: { centerU: 2, width: 2, bottom: -1, top: 4 },
      fill: 'glass', transmittance: null, status: 'stale'
    }];
    project.buildings.push(building);

    const result = validateProject(project);

    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.includes('关联房间'))).toBe(true);
    expect(result.errors.some(error => error.includes('中心位置'))).toBe(true);
    expect(result.errors.some(error => error.includes('状态'))).toBe(true);
  });

  it('clones valid version-two projects during migration', () => {
    const project = createDefaultProject();
    const migrated = migrateProject(project);
    expect(migrated).toEqual(project);
    expect(migrated).not.toBe(project);
  });

  it('rejects future project versions', () => {
    expect(() => migrateProject({ schemaVersion: 3 })).toThrow('不支持的项目版本：3');
  });
  it('rejects explicit invalid L-shape geometry', () => {
    const project = createDefaultProject();
    project.buildings.push(validBar({
      template: 'lShape',
      params: {
        length: 20, depth: 20,
        wingLength: 20, wingDepth: 8,
        floors: 5, floorHeight: 3
      }
    }));

    const result = validateProject(project);

    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.includes('wingLength'))).toBe(true);
  });

  it('rejects missing and wall-collapsing courtyard geometry', () => {
    const project = createDefaultProject();
    project.buildings.push(validBar({
      template: 'courtyard',
      params: {
        length: 20, depth: 20,
        courtyardLength: null, courtyardDepth: 18,
        floors: 5, floorHeight: 3
      }
    }));

    const result = validateProject(project);

    expect(result.ok).toBe(false);
    expect(result.errors.some(error => error.includes('courtyardLength'))).toBe(true);
    expect(result.errors.some(error => error.includes('courtyardDepth'))).toBe(true);
  });
});
