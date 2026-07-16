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
  p.simulation.activeRoomId = 'room-a';
  const building = {
    id: 'b1', revision: 1, name: '住宅 A', template: 'bar',
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 60, depth: 18, floors: 3, floorHeight: 3 },
    rooms: [{
      id: 'room-a', name: 'Living room', floor: 1, objects: [],
      rects: [{ x0: -3, z0: -9, x1: 3, z1: -4 }]
    }],
    openings: []
  };
  const southWall = deriveWalls(building, 1)
    .find(wall => wall.normal[0] === 0 && wall.normal[1] === -1);
  building.openings.push(createOpeningFromPreset({
    wall: southWall, preset: 'window', centerU: 0.5, id: 'opening-a'
  }));
  p.buildings = [building];
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

  it('publishes only room-first state and commands', () => {
    const controller = createSimulationController(createStore(createDefaultProject()));
    expect(controller.getState()).toMatchObject({
      activeRoomId: null, roomOptions: [], noRoom: true
    });
    expect(controller.getState()).not.toHaveProperty('activeAreaId');
    expect(controller.getState()).not.toHaveProperty('areaOptions');
    expect(controller.getState()).not.toHaveProperty('noArea');
    expect(controller).not.toHaveProperty('setActiveArea');
    controller.dispose();
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
    expect(state.noRoom).toBe(false);
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
      rooms: [], openings: []
    });
    const controller = createSimulationController(createStore(p));
    expect(controller.getState().hasDirectSun).toBe(false);
  });

  it('flags noRoom when there are no rooms', () => {
    const controller = createSimulationController(createStore(createDefaultProject()));
    const state = controller.getState();
    expect(state.noRoom).toBe(true);
    expect(state.roomOptions).toEqual([]);
  });

  it('lists all rooms as options and switches the active room', () => {
    const store = createStore(projectWithSouthWindow());
    const controller = createSimulationController(store);
    expect(controller.getState().roomOptions).toEqual([{ id: 'room-a', name: 'Living room', buildingId: 'b1' }]);
    controller.setActiveRoom('room-a');
    expect(store.getState().simulation.activeRoomId).toBe('room-a');
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

describe('daily worker wiring', () => {
  it('publishes a daily analysis failure without retrying the same input', async () => {
    vi.useFakeTimers();
    const analyze = vi.fn().mockRejectedValue(new Error('worker crashed'));
    const store = createStore(projectWithSouthWindow());
    const controller = createSimulationController(store, {
      analysisClientFactory: () => ({ analyze, dispose: vi.fn() })
    });

    await vi.advanceTimersByTimeAsync(300);

    expect(controller.getState().dailyError).toBe('worker crashed');
    await vi.advanceTimersByTimeAsync(1000);
    expect(analyze).toHaveBeenCalledOnce();

    controller.dispose();
    vi.useRealTimers();
  });
  it('merges the full-day result into state (latest key wins)', async () => {
    vi.useFakeTimers();
    const analyze = vi.fn().mockResolvedValue({
      intervals: [{ startMinute: 600, endMinute: 660 }],
      totalMinutes: 60
    });
    const factory = () => ({ analyze, dispose: vi.fn() });
    const store = createStore(projectWithSouthWindow());
    const controller = createSimulationController(store, { analysisClientFactory: factory });

    // Trigger a state pass, run the debounce, flush the promise.
    controller.setTime('12:00');
    await vi.advanceTimersByTimeAsync(300);

    expect(analyze).toHaveBeenCalledTimes(1);
    const payload = analyze.mock.calls[0][0];
    expect(payload.localDate).toBe('2026-12-21');
    expect(payload.frame).toMatchObject({ rotation: 0, baseY: 0 });

    expect(controller.getState().totalMinutes).toBe(60);
    expect(controller.getState().intervals).toEqual([{ startMinute: 600, endMinute: 660 }]);

    // Time-only changes reuse the cached result (no re-request).
    controller.setTime('13:00');
    await vi.advanceTimersByTimeAsync(300);
    expect(analyze).toHaveBeenCalledTimes(1);

    // Date change invalidates the key and refetches.
    controller.setDate('2026-06-21');
    await vi.advanceTimersByTimeAsync(300);
    expect(analyze).toHaveBeenCalledTimes(2);

    controller.dispose();
    vi.useRealTimers();
  });
});
import { createOpeningFromPreset } from '../../src/domain/openings/openingGeometry.js';
import { deriveWalls } from '../../src/domain/walls/deriveWalls.js';
