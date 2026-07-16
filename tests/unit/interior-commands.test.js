import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createStore } from '../../src/store/createStore.js';
import { createReturnExteriorCommand, createViewRoomSunlightCommand } from '../../src/store/roomCommands.js';

function seed() {
  const project = createDefaultProject();
  project.buildings.push({
    id: 'b1', name: '住宅 1', template: 'bar', revision: 1,
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 20, depth: 10, floors: 1, floorHeight: 3 }, openings: [],
    rooms: [{ id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [], rects: [] }]
  });
  return createStore(project);
}

describe('room interior navigation commands', () => {
  it('enters an existing room and activates its direct-sun analysis', () => {
    const store = seed();
    store.execute(createViewRoomSunlightCommand('b1', 'r1'));
    expect(store.getState().view.interiorRoomId).toBe('r1');
    expect(store.getState().simulation.activeRoomId).toBe('r1');
  });

  it('rejects an unknown room', () => {
    const store = seed();
    expect(store.execute(createViewRoomSunlightCommand('b1', 'missing'))).toBe(false);
    expect(store.getState().view.interiorRoomId).toBeNull();
  });

  it('returns to the building exterior while retaining analysis room', () => {
    const store = seed();
    store.execute(createViewRoomSunlightCommand('b1', 'r1'));
    store.execute(createReturnExteriorCommand('b1'));
    expect(store.getState().view.interiorRoomId).toBeNull();
    expect(store.getState().view.selection).toEqual({ kind: 'building', id: 'b1' });
    expect(store.getState().simulation.activeRoomId).toBe('r1');
  });
});
