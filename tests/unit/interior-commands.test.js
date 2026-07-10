import { describe, it, expect } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import {
  createEnterInteriorCommand, createExitInteriorCommand, createSetPhaseCommand,
  createAddBuildingCommand, createAddObservationAreaCommand
} from '../../src/store/buildingCommands.js';

function seed() {
  const store = createStore(createDefaultProject());
  store.execute(createAddBuildingCommand({ id: 'b1' }));
  store.execute(createAddObservationAreaCommand('b1', { id: 'a1', floor: 1, rects: [{ x0: 0, z0: 0, x1: 4, z1: 4 }] }));
  store.execute(createSetPhaseCommand('present'));
  return store;
}

describe('interior session commands', () => {
  it('enters interior for an existing area in present phase', () => {
    const store = seed();
    store.execute(createEnterInteriorCommand({ buildingId: 'b1', areaId: 'a1' }));
    expect(store.getState().view.interior).toEqual({ buildingId: 'b1', areaId: 'a1' });
  });

  it('does not enter for an unknown area', () => {
    const store = seed();
    store.execute(createEnterInteriorCommand({ buildingId: 'b1', areaId: 'nope' }));
    expect(store.getState().view.interior).toBeNull();
  });

  it('exits interior', () => {
    const store = seed();
    store.execute(createEnterInteriorCommand({ buildingId: 'b1', areaId: 'a1' }));
    store.execute(createExitInteriorCommand());
    expect(store.getState().view.interior).toBeNull();
  });

  it('leaving present phase clears interior', () => {
    const store = seed();
    store.execute(createEnterInteriorCommand({ buildingId: 'b1', areaId: 'a1' }));
    store.execute(createSetPhaseCommand('edit'));
    expect(store.getState().view.interior).toBeNull();
  });
});
