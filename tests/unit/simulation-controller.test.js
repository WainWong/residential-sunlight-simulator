import { describe, expect, it, vi } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createSimulationController } from '../../src/features/results/createSimulationController.js';
import { createPlayback } from '../../src/features/timeline/usePlayback.js';
import { createStore } from '../../src/store/createStore.js';

function createFixture() {
  const store = createStore(createDefaultProject());
  const controller = createSimulationController(store);
  return { controller, store };
}

function projectWithSouthWindow() {
  const p = createDefaultProject();
  p.simulation.date = '2026-12-21';
  p.simulation.time = '12:00';
  p.simulation.activeAreaId = 'area-a';
  p.buildings = [{
    id: 'b1', revision: 1, name: '住宅 A', template: 'bar',
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 60, depth: 18, floors: 3, floorHeight: 3 },
    observationAreas: [{
      id: 'area-a', name: '客厅', floor: 1,
      cells: [[0, -8]], sampleHeight: 1.2, openingIds: ['op1']
    }],
    openings: [{ id: 'op1', type: 'window', wallId: 'south-0', floor: 1, width: 3, height: 1.6, sillHeight: 0.9 }]
  }];
  return p;
}

describe('simulation controller', () => {
  it('publishes solar results and stores the changed time', () => {
    const store = createStore(projectWithSouthWindow());
    const controller = createSimulationController(store);
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setTime('12:00');

    expect(store.getState().simulation.time).toBe('12:00');
    expect(controller.getState().time).toBe('12:00');
    expect(controller.getState().hasDirectSun).toBe(true);
    expect(controller.getState().solar.altitudeDeg).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('changes the date without changing the time', () => {
    const { controller, store } = createFixture();

    controller.setDate('2024-02-29');

    expect(store.getState().simulation).toMatchObject({
      date: '2024-02-29',
      time: '09:30'
    });
    expect(controller.getState()).toMatchObject({
      date: '2024-02-29',
      time: '09:30'
    });
  });

  it('changes the time without changing the date', () => {
    const { controller, store } = createFixture();

    controller.setTime('15:45');

    expect(store.getState().simulation).toMatchObject({
      date: '2026-12-21',
      time: '15:45'
    });
    expect(controller.getState()).toMatchObject({
      date: '2026-12-21',
      time: '15:45'
    });
  });

  it('updates the project location and derived solar input', () => {
    const { controller, store } = createFixture();
    const location = {
      cityId: 'harbin',
      latitude: 45.8038,
      longitude: 126.5349,
      timeZone: 'Asia/Shanghai'
    };

    controller.setLocation(location);

    expect(store.getState().location).toEqual(location);
    expect(controller.getState().location).toEqual(location);
  });

  it('recalculates and notifies once for each store change', () => {
    const { controller, store } = createFixture();
    const listener = vi.fn();
    controller.subscribe(listener);

    store.execute({
      label: '修改模拟日期和时间',
      apply: project => ({
        ...project,
        simulation: {
          ...project.simulation,
          date: '2025-06-21',
          time: '10:15'
        }
      })
    });

    expect(controller.getState()).toMatchObject({
      date: '2025-06-21',
      time: '10:15'
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('disposes its store subscription and controller listeners', () => {
    const { controller, store } = createFixture();
    const listener = vi.fn();
    controller.subscribe(listener);
    const stateBeforeDispose = controller.getState();

    controller.dispose();
    store.execute({
      label: '修改模拟时间',
      apply: project => ({
        ...project,
        simulation: { ...project.simulation, time: '13:00' }
      })
    });

    expect(listener).not.toHaveBeenCalled();
    expect(controller.getState()).toBe(stateBeforeDispose);
  });
});

describe('simulation controller — real geometry', () => {
  it('reports direct sun for an unobstructed south window at noon', () => {
    const controller = createSimulationController(createStore(projectWithSouthWindow()));
    const state = controller.getState();
    expect(state.noArea).toBe(false);
    expect(state.hasDirectSun).toBe(true);
    expect(state.litRatio).toBeGreaterThan(0);
    expect(state.totalMinutes).toBeNull();
  });

  it('loses direct sun when a tall building blocks the window', () => {
    const p = projectWithSouthWindow();
    p.buildings.push({
      id: 'blocker', revision: 1, name: '遮挡楼', template: 'bar',
      position: { x: 0, z: -30 }, rotation: 0,
      params: { length: 120, depth: 18, floors: 40, floorHeight: 3 },
      observationAreas: [], openings: []
    });
    const controller = createSimulationController(createStore(p));
    expect(controller.getState().hasDirectSun).toBe(false);
  });

  it('flags noArea when there are no observation areas', () => {
    const controller = createSimulationController(createStore(createDefaultProject()));
    const state = controller.getState();
    expect(state.noArea).toBe(true);
    expect(state.areaOptions).toEqual([]);
  });

  it('lists all observation areas as options and switches active area', () => {
    const store = createStore(projectWithSouthWindow());
    const controller = createSimulationController(store);
    expect(controller.getState().areaOptions).toEqual([{ id: 'area-a', name: '客厅' }]);
    controller.setActiveArea('area-a');
    expect(store.getState().simulation.activeAreaId).toBe('area-a');
  });
});

describe('independent playback', () => {
  it('advances only the supplied value and wraps', () => {
    vi.useFakeTimers();
    let value = 364;
    const playback = createPlayback({
      read: () => value,
      write: next => { value = next; },
      min: 0,
      max: 364,
      step: 1,
      intervalMs: 100
    });

    playback.toggle();
    vi.advanceTimersByTime(100);
    expect(value).toBe(0);
    playback.dispose();
    vi.useRealTimers();
  });

  it('stops an active playback when requested', () => {
    vi.useFakeTimers();
    let value = 0;
    const playback = createPlayback({
      read: () => value,
      write: next => { value = next; },
      min: 0,
      max: 4,
      intervalMs: 100
    });
    playback.toggle();
    playback.stop();
    vi.advanceTimersByTime(300);
    expect(value).toBe(0);
    vi.useRealTimers();
  });
});
