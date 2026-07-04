import { getSolarPosition } from '../../domain/solar/getSolarPosition.js';

const DIRECT_INTERVAL = { startMinute: 552, endMinute: 878 };

export function timeToMinute(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minuteToTime(minute) {
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function createSimulationController(store) {
  const listeners = new Set();
  let state;

  function calculate() {
    const project = store.getState();
    const input = {
      location: project.location,
      date: project.simulation.date,
      time: project.simulation.time
    };
    const minute = timeToMinute(input.time);
    const solar = getSolarPosition({
      ...input.location,
      localDate: input.date,
      localTime: input.time
    });
    const hasDirectSun = solar.aboveHorizon &&
      minute >= DIRECT_INTERVAL.startMinute &&
      minute < DIRECT_INTERVAL.endMinute;
    state = {
      ...input,
      minute,
      solar,
      hasDirectSun,
      litRatio: hasDirectSun ? 0.58 : 0,
      intervals: [DIRECT_INTERVAL],
      totalMinutes: DIRECT_INTERVAL.endMinute - DIRECT_INTERVAL.startMinute
    };
  }

  function update() {
    calculate();
    for (const listener of listeners) listener(state);
  }

  calculate();
  const unsubscribeStore = store.subscribe(update);

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTime(time) {
      store.execute({
        label: '修改模拟时间',
        apply: project => ({
          ...project,
          simulation: { ...project.simulation, time }
        })
      });
    },
    setDate(date) {
      store.execute({
        label: '修改模拟日期',
        apply: project => ({
          ...project,
          simulation: { ...project.simulation, date }
        })
      });
    },
    setLocation(location) {
      store.execute({
        label: '修改项目位置',
        apply: project => ({
          ...project,
          location: structuredClone(location)
        })
      });
    },
    dispose() {
      unsubscribeStore();
      listeners.clear();
    }
  };
}