import { describe, expect, it, vi } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createOpeningFromPreset } from '../../src/domain/openings/openingGeometry.js';
import { deriveWalls } from '../../src/domain/walls/deriveWalls.js';
import { createStore } from '../../src/store/createStore.js';
import {
  createAddBuildingCommand,
  createUpdateBuildingCommand
} from '../../src/store/projectCommands.js';

function projectWithRoom({
  params = { length: 10, depth: 8, floors: 2, floorHeight: 3 },
  room = {
    id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
    rects: [{ x0: -5, z0: -4, x1: 5, z1: 4 }]
  }
} = {}) {
  const project = createDefaultProject();
  project.buildings = [{
    id: 'b1', name: '住宅 1', template: 'bar', revision: 1,
    position: { x: 0, z: 0 }, rotation: 0, params,
    rooms: [room], openings: []
  }];
  return project;
}

describe('room-first project building commands', () => {
  it('seeds the selected template defaults when adding a building', () => {
    const project = createAddBuildingCommand({ id: 'b1', template: 'lShape' })
      .apply(createDefaultProject());

    expect(project.buildings[0]).toMatchObject({
      template: 'lShape',
      params: {
        length: 60,
        depth: 40,
        wingLength: 18,
        wingDepth: 16,
        floors: 10,
        floorHeight: 3
      }
    });
  });

  it('switches to complete courtyard params without stale geometry fields', () => {
    const added = createAddBuildingCommand({
      id: 'b1',
      template: 'lShape',
      params: { firstFloorHeight: 4.2, facade: 'warm' }
    }).apply(createDefaultProject());

    const project = createUpdateBuildingCommand('b1', { template: 'courtyard' })
      .apply(added);

    expect(project.buildings[0].params).toEqual({
      length: 60,
      depth: 40,
      courtyardLength: 30,
      courtyardDepth: 16,
      floors: 10,
      floorHeight: 3,
      firstFloorHeight: 4.2,
      facade: 'warm'
    });
    expect(project.buildings[0].params).not.toHaveProperty('wingLength');
    expect(project.buildings[0].params).not.toHaveProperty('wingDepth');
  });

  it('normalizes same-template geometry patches', () => {
    const added = createAddBuildingCommand({ id: 'b1', template: 'courtyard' })
      .apply(createDefaultProject());
    const project = createUpdateBuildingCommand('b1', {
      params: { courtyardLength: 100 }
    }).apply(added);

    expect(project.buildings[0].params.courtyardLength).toBe(56);
  });

  it('rejects an unsupported template without publishing or adding history', () => {
    const initial = createAddBuildingCommand({ id: 'b1' }).apply(createDefaultProject());
    const store = createStore(initial);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.execute(createUpdateBuildingCommand('b1', { template: 'tower' })))
      .toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(store.canUndo()).toBe(false);
    expect(store.getState()).toEqual(initial);
  });

  it('rejects shrinking a building outside an existing room', () => {
    const project = projectWithRoom();
    const store = createStore(project);

    expect(store.execute(createUpdateBuildingCommand('b1', {
      params: { length: 8 }
    }))).toBe(false);
    expect(store.getState().buildings[0].params.length).toBe(10);
  });

  it('rejects reducing floors below an existing room', () => {
    const project = projectWithRoom({
      room: {
        id: 'r1', floor: 2, name: '客厅', type: 'living', objects: [],
        rects: [{ x0: -5, z0: -4, x1: 5, z1: 4 }]
      }
    });
    const store = createStore(project);

    expect(store.execute(createUpdateBuildingCommand('b1', {
      params: { floors: 1 }
    }))).toBe(false);
    expect(store.getState().buildings[0].params.floors).toBe(2);
  });

  it('rejects a courtyard change that puts an existing room in the void', () => {
    const project = projectWithRoom({
      params: { length: 60, depth: 40, floors: 2, floorHeight: 3 },
      room: {
        id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
        rects: [{ x0: -4, z0: -4, x1: 4, z1: 4 }]
      }
    });
    const store = createStore(project);

    expect(store.execute(createUpdateBuildingCommand('b1', {
      template: 'courtyard'
    }))).toBe(false);
    expect(store.getState().buildings[0].template).toBe('bar');
  });

  it('reprojects openings atomically after a valid template change', () => {
    const project = projectWithRoom({
      params: { length: 60, depth: 40, floors: 2, floorHeight: 3 },
      room: {
        id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
        rects: [{ x0: -20, z0: -20, x1: 20, z1: -10 }]
      }
    });
    const building = project.buildings[0];
    const wall = deriveWalls(building, 1)
      .find(candidate => candidate.kind === 'exterior' && candidate.normal[1] === -1);
    building.openings = [
      createOpeningFromPreset({
        wall, preset: 'window', centerU: 0.75, floorHeight: 3, id: 'o1'
      })
    ];
    const originalWallId = building.openings[0].wallAnchor.wallId;
    const store = createStore(project);

    expect(store.execute(createUpdateBuildingCommand('b1', {
      template: 'lShape'
    }))).toBe(true);
    const updatedOpening = store.getState().buildings[0].openings[0];
    expect(updatedOpening.status).toBe('valid');
    expect(updatedOpening.wallAnchor.wallId).not.toBe(originalWallId);
    expect(deriveWalls(store.getState().buildings[0], 1)
      .some(candidate => candidate.id === updatedOpening.wallAnchor.wallId)).toBe(true);
  });
  it('allows position and rotation updates when an existing opening is invalid', () => {
    const project = projectWithRoom();
    const building = project.buildings[0];
    const wall = deriveWalls(building, 1)[0];
    const opening = createOpeningFromPreset({
      wall, preset: 'window', centerU: 0.5, floorHeight: 3, id: 'o1'
    });
    opening.bounds.width = wall.length + 1;
    opening.status = 'invalid';
    building.openings = [opening];
    const store = createStore(project);

    expect(store.execute(createUpdateBuildingCommand('b1', {
      position: { x: 12, z: -3 },
      rotation: 20
    }))).toBe(true);
    expect(store.getState().buildings[0]).toMatchObject({
      position: { x: 12, z: -3 },
      rotation: 20,
      openings: [{ id: 'o1', status: 'invalid' }]
    });
  });

});
