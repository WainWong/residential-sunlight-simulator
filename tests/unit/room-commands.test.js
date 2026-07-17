import { describe, expect, it } from 'vitest';
import { createOpeningFromPreset } from '../../src/domain/openings/openingGeometry.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { deriveWalls } from '../../src/domain/walls/deriveWalls.js';
import { createStore } from '../../src/store/createStore.js';
import {
  createAddOpeningCommand,
  createAppendRoomRectCommand,
  createCancelRoomCommand,
  createEnterRoomViewCommand,
  createFinishRoomCommand,
  createSelectEntityCommand,
  createSetTaskPhaseCommand,
  createStartRoomCommand,
  createUpdateRoomCommand,
  createViewRoomSunlightCommand
} from '../../src/store/roomCommands.js';

function projectWithBuilding() {
  const project = createDefaultProject();
  project.buildings.push({
    id: 'b1', name: '住宅 1', template: 'bar', revision: 1,
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 20, depth: 10, floors: 2, floorHeight: 3 },
    rooms: [], openings: []
  });
  return project;
}

describe('room commands', () => {
  it('keeps a create session temporary and commits connected rects as one room', () => {
    const store = createStore(projectWithBuilding());
    store.execute(createStartRoomCommand('b1', 2));
    expect(store.getState().buildings[0].rooms).toEqual([]);
    expect(store.getState().view.phase).toBe('room');

    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -3, x1: 0, z1: 3 }));
    store.execute(createAppendRoomRectCommand({ x0: 0, z0: -3, x1: 4, z1: 0 }));
    store.execute(createFinishRoomCommand());

    const room = store.getState().buildings[0].rooms[0];
    expect(room).toMatchObject({ floor: 2, name: '房间 1', type: null, objects: [] });
    expect(room.rects).toHaveLength(2);
    expect(store.getState().view).toMatchObject({
      phase: 'room',
      roomFocus: { buildingId: 'b1', floor: 2 },
      roomEditing: null,
      selection: { kind: 'room', id: room.id, buildingId: 'b1' }
    });
    expect(store.canUndo()).toBe(true);
  });

  it('finishing a room keeps the room-focus view open (lid stays lifted)', () => {
    const store = createStore(projectWithBuilding());
    store.execute(createStartRoomCommand('b1', 1));
    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -3, x1: 4, z1: 3 }));
    store.execute(createFinishRoomCommand());
    // draft cleared, but still in the room view on the same floor
    expect(store.getState().view.roomEditing).toBeNull();
    expect(store.getState().view.roomFocus).toEqual({ buildingId: 'b1', floor: 1 });
    expect(store.getState().view.phase).toBe('room');
  });

  it('enters the room view without starting a draft and clamps the floor', () => {
    const store = createStore(projectWithBuilding());
    store.execute(createEnterRoomViewCommand('b1', 99));
    const view = store.getState().view;
    expect(view.phase).toBe('room');
    expect(view.roomEditing).toBeNull();
    expect(view.roomFocus).toEqual({ buildingId: 'b1', floor: 2 });
    expect(createEnterRoomViewCommand('missing').apply(store.getState())).toBeNull();
  });

  it('leaving the room phase clears the room-focus view', () => {
    const store = createStore(projectWithBuilding());
    store.execute(createEnterRoomViewCommand('b1', 1));
    store.execute(createSetTaskPhaseCommand('building'));
    expect(store.getState().view.roomFocus).toBeNull();
    expect(store.getState().view.roomEditing).toBeNull();
  });

  it('rejects disconnected and occupied rects without creating a history entry', () => {
    const project = projectWithBuilding();
    project.buildings[0].rooms.push({
      id: 'existing', floor: 1, name: '卧室 1', type: 'bedroom', objects: [],
      rects: [{ x0: 1, z0: -2, x1: 4, z1: 2 }]
    });
    const store = createStore(project);
    store.execute(createStartRoomCommand('b1', 1));
    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -2, x1: -1, z1: 2 }));
    expect(store.execute(createAppendRoomRectCommand({ x0: 2, z0: -1, x1: 3, z1: 1 }))).toBe(false);
    expect(store.getState().view.roomEditing.rects).toHaveLength(1);
  });

  it('cancels without writing a room and supports entity selection', () => {
    const store = createStore(projectWithBuilding());
    store.execute(createStartRoomCommand('b1', 1));
    store.execute(createCancelRoomCommand());
    store.execute(createSelectEntityCommand({ kind: 'building', id: 'b1' }));
    expect(store.getState().buildings[0].rooms).toEqual([]);
    expect(store.getState().view.selection).toEqual({ kind: 'building', id: 'b1' });
  });

  it('updates room metadata and adds an explicit opening', () => {
    const project = projectWithBuilding();
    const building = project.buildings[0];
    building.rooms.push({ id: 'r1', floor: 1, name: '房间 1', type: null,
      rects: [{ x0: -4, z0: -2, x1: 4, z1: 2 }], objects: [] });
    const opening = createOpeningFromPreset({ wall: deriveWalls(building, 1)[0], preset: 'window', id: 'o1' });
    const store = createStore(project);
    store.execute(createUpdateRoomCommand('b1', 'r1', { type: 'living', name: '客厅' }));
    store.execute(createAddOpeningCommand('b1', opening));
    expect(store.getState().buildings[0].rooms[0]).toMatchObject({ type: 'living', name: '客厅' });
    expect(store.getState().buildings[0].openings).toHaveLength(1);
  });

  it('enters sunlight for a room in one command', () => {
    const project = projectWithBuilding();
    project.buildings[0].rooms.push({ id: 'r1', floor: 1, name: '客厅', type: 'living', rects: [], objects: [] });
    const store = createStore(project);
    store.execute(createViewRoomSunlightCommand('b1', 'r1'));
    expect(store.getState().simulation.activeRoomId).toBe('r1');
    expect(store.getState().view).toMatchObject({
      phase: 'sunlight', interiorRoomId: 'r1',
      selection: { kind: 'room', id: 'r1', buildingId: 'b1' }
    });
  });
});
