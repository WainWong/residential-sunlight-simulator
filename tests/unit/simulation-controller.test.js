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

describe('simulation controller', () => {
  it('publishes solar results and stores the changed time', () => {
    const { controller, store } = createFixture();
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