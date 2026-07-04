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
    expect(Object.isFrozen(BUILDING_DEFAULTS)).toBe(true);
    expect(Object.values(BUILDING_DEFAULTS).every(Object.isFrozen)).toBe(true);
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

  it.each([
    ['lShape', {
      length: 72,
      depth: 40,
      wingLength: 18,
      wingDepth: 16,
      floors: 21,
      floorHeight: 3.2,
      firstFloorHeight: 4.2
    }],
    ['courtyard', {
      length: 72,
      depth: 40,
      courtyardLength: 30,
      courtyardDepth: 16,
      floors: 21,
      floorHeight: 3.2,
      firstFloorHeight: 4.2
    }]
  ])('seeds defaults when changing a bar building to %s', (template, expectedParams) => {
    const project = createAddBuildingCommand({
      id: 'building-a',
      params: { floors: 21, floorHeight: 3.2, firstFloorHeight: 4.2 }
    }).apply(createDefaultProject());

    const next = createUpdateBuildingCommand('building-a', {
      template,
      params: { length: 72 }
    }).apply(project);

    expect(next.buildings[0]).toMatchObject({ template, params: expectedParams });
    expect(next.buildings[0].params).toEqual(expectedParams);
  });

  it('preserves shared params and removes geometry from the previous template', () => {
    const project = createAddBuildingCommand({
      id: 'building-a',
      template: 'lShape',
      params: {
        wingLength: 22,
        wingDepth: 20,
        firstFloorHeight: 4.8,
        facade: 'warm'
      }
    }).apply(createDefaultProject());

    const next = createUpdateBuildingCommand('building-a', {
      template: 'courtyard'
    }).apply(project);

    expect(next.buildings[0].params).toEqual({
      length: 60,
      depth: 40,
      courtyardLength: 30,
      courtyardDepth: 16,
      floors: 33,
      floorHeight: 3,
      firstFloorHeight: 4.8,
      facade: 'warm'
    });
  });

  it('does nothing when changing to an unsupported template', () => {
    const project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());

    expect(createUpdateBuildingCommand('building-a', { template: 'tower' }).apply(project))
      .toBe(project);
  });

  it('only applies editable fields and clones nested patch values', () => {
    const project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());
    const position = { x: 8 };
    const params = { depth: 24 };
    const next = createUpdateBuildingCommand('building-a', {
      id: 'building-b',
      revision: 99,
      openings: [{ id: 'opening-a' }],
      observationAreas: [{ id: 'area-a' }],
      unexpected: true,
      name: 'South Building',
      position,
      params
    }).apply(project);
    const updated = next.buildings[0];

    expect(updated).toMatchObject({
      id: 'building-a',
      revision: 2,
      name: 'South Building',
      position: { x: 8, z: 0 },
      params: { length: 60, depth: 24 }
    });
    expect(updated).not.toHaveProperty('unexpected');
    expect(updated.openings).toEqual([]);
    expect(updated.observationAreas).toEqual([]);
    expect(updated.position).not.toBe(position);
    expect(updated.params).not.toBe(params);
  });

  it('resets a malformed revision to one when updating', () => {
    const project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());
    project.buildings[0].revision = 'invalid';

    const next = createUpdateBuildingCommand('building-a', { name: 'South Building' }).apply(project);

    expect(next.buildings[0].revision).toBe(1);
  });

  it('keeps only the most recently added building as the active draft', () => {
    let project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());
    project = createAddBuildingCommand({ id: 'building-b' }).apply(project);

    expect(project.buildings.map(building => building.id)).toEqual(['building-a', 'building-b']);
    expect(project.view).toMatchObject({
      selectedBuildingId: 'building-b',
      editingBuildingId: 'building-b',
      addingBuildingId: 'building-b'
    });
  });

  it('does nothing when finishing a building that is not being edited', () => {
    let project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());
    project = createAddBuildingCommand({ id: 'building-b' }).apply(project);

    const next = createFinishBuildingCommand('building-a').apply(project);

    expect(next).toBe(project);
  });

  it('preserves unrelated selection and editing when cancelling a draft', () => {
    let project = createAddBuildingCommand({ id: 'building-a' }).apply(createDefaultProject());
    project = createAddBuildingCommand({ id: 'building-b' }).apply(project);
    project = {
      ...project,
      view: {
        ...project.view,
        selectedBuildingId: 'building-a',
        editingBuildingId: 'building-a'
      }
    };

    const next = createCancelAddedBuildingCommand('building-b').apply(project);

    expect(next.buildings.map(building => building.id)).toEqual(['building-a']);
    expect(next.view).toMatchObject({
      selectedBuildingId: 'building-a',
      editingBuildingId: 'building-a',
      addingBuildingId: null
    });
  });

});
