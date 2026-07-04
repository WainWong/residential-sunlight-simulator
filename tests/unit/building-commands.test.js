import { describe, expect, it } from 'vitest';
import {
  editorPositionToScene,
  normalizeRotation,
  scenePositionToEditor
} from '../../src/domain/buildings/editorCoordinates.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createStore } from '../../src/store/createStore.js';
import {
  BUILDING_DEFAULTS,
  createAddBuildingCommand,
  createCancelAddedBuildingCommand,
  createClearBuildingsCommand,
  createFinishBuildingCommand,
  createRemoveBuildingCommand,
  createSelectBuildingCommand,
  createUpdateBuildingCommand
} from '../../src/store/buildingCommands.js';

describe('building editor coordinates', () => {
  it('maps UI X/Y to scene X/Z and converts numeric values', () => {
    expect(editorPositionToScene({ x: '12.5', y: '-8' })).toEqual({ x: 12.5, z: -8 });
    expect(scenePositionToEditor({ x: '4', z: '9' })).toEqual({ x: 4, y: 9 });
  });

  it('normalizes positive and negative finite rotations', () => {
    expect(normalizeRotation(375)).toBe(15);
    expect(normalizeRotation(-30)).toBe(330);
    expect(normalizeRotation(360)).toBe(0);
  });

  it('does not turn non-finite rotation into a valid value', () => {
    expect(normalizeRotation(Infinity)).toBeNaN();
  });
});

describe('building commands', () => {
  it('exports the building editor template defaults', () => {
    expect(BUILDING_DEFAULTS).toEqual({
      bar: { length: 60, depth: 18 },
      lShape: { length: 60, depth: 40, wingLength: 18, wingDepth: 16 },
      courtyard: {
        length: 60,
        depth: 40,
        courtyardLength: 30,
        courtyardDepth: 16
      }
    });
  });

  it('adds persisted building drafts at the origin with sequential Chinese names', () => {
    const store = createStore(createDefaultProject());
    store.execute(createAddBuildingCommand({ id: 'building-a' }));
    store.execute(createFinishBuildingCommand('building-a'));
    store.execute(createAddBuildingCommand({ id: 'building-b', template: 'lShape' }));

    expect(store.getState().buildings[0]).toEqual({
      id: 'building-a',
      revision: 1,
      name: '住宅 1',
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
      openings: []
    });
    expect(store.getState().buildings[1].name).toBe('住宅 2');
    expect(store.getState().buildings[1].params).toMatchObject({
      length: 60,
      depth: 40,
      wingLength: 18,
      wingDepth: 16,
      floors: 33,
      floorHeight: 3
    });
    expect(store.getState().view).toMatchObject({
      selectedBuildingId: 'building-b',
      editingBuildingId: 'building-b',
      addingBuildingId: 'building-b'
    });
  });

  it('updates coordinates and geometry immutably with one revision increment', () => {
    const project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());
    const next = createUpdateBuildingCommand('building-a', {
      name: '南楼',
      position: { x: 18 },
      rotation: 375,
      params: { length: 72 }
    }).apply(project);

    expect(next).not.toBe(project);
    expect(next.buildings[0]).toMatchObject({
      revision: 2,
      name: '南楼',
      position: { x: 18, z: 0 },
      rotation: 15,
      params: { length: 72, depth: 18, floors: 33, floorHeight: 3 }
    });
    expect(project.buildings[0]).toMatchObject({
      revision: 1,
      name: '住宅 1',
      position: { x: 0, z: 0 },
      rotation: 0,
      params: { length: 60 }
    });
  });

  it('does nothing when updating a missing building', () => {
    const project = createDefaultProject();

    expect(createUpdateBuildingCommand('missing', { name: '不存在' }).apply(project)).toBe(project);
  });

  it('finishes a draft and reselects it for editing', () => {
    const store = createStore(createDefaultProject());
    store.execute(createAddBuildingCommand({ id: 'building-a' }));
    store.execute(createFinishBuildingCommand('building-a'));

    expect(store.getState().view).toMatchObject({
      selectedBuildingId: 'building-a',
      editingBuildingId: null,
      addingBuildingId: null
    });

    store.execute(createSelectBuildingCommand('building-a'));
    expect(store.getState().view.editingBuildingId).toBeNull();

    store.execute(createSelectBuildingCommand('building-a', { editing: true }));
    expect(store.getState().view).toMatchObject({
      selectedBuildingId: 'building-a',
      editingBuildingId: 'building-a'
    });
  });

  it('cancels only the building currently being added', () => {
    const project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());
    const unchanged = createCancelAddedBuildingCommand('building-b').apply(project);
    const cancelled = createCancelAddedBuildingCommand('building-a').apply(project);

    expect(unchanged).toBe(project);
    expect(cancelled.buildings).toEqual([]);
    expect(cancelled.view).toMatchObject({
      selectedBuildingId: null,
      editingBuildingId: null,
      addingBuildingId: null
    });
  });

  it('removes a building and clears only matching view ids', () => {
    let project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());
    project = createFinishBuildingCommand('building-a').apply(project);
    project = createAddBuildingCommand({ id: 'building-b' }).apply(project);
    project = {
      ...project,
      view: {
        ...project.view,
        selectedBuildingId: 'building-a',
        editingBuildingId: 'building-b',
        addingBuildingId: 'building-b'
      }
    };

    const next = createRemoveBuildingCommand('building-a').apply(project);

    expect(next.buildings.map(building => building.id)).toEqual(['building-b']);
    expect(next.view).toMatchObject({
      selectedBuildingId: null,
      editingBuildingId: 'building-b',
      addingBuildingId: 'building-b'
    });
  });

  it('clears buildings and active area while preserving project settings', () => {
    let project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());
    project = {
      ...project,
      location: { ...project.location, cityId: 'beijing' },
      simulation: {
        ...project.simulation,
        date: '2026-06-21',
        time: '15:45',
        activeAreaId: 'area-a'
      },
      view: {
        ...project.view,
        camera: { x: 3, y: 8, z: 12 },
        preferences: { shadows: true }
      }
    };

    const next = createClearBuildingsCommand().apply(project);

    expect(next.buildings).toEqual([]);
    expect(next.location).toEqual(project.location);
    expect(next.simulation).toEqual({
      ...project.simulation,
      activeAreaId: null
    });
    expect(next.view).toEqual({
      ...project.view,
      selectedBuildingId: null,
      editingBuildingId: null,
      addingBuildingId: null
    });
  });
});
