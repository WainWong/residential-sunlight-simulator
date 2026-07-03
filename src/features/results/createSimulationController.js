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

export function createSimulationController(initial = {}) {
  const listeners = new Set();
  let input = {
    location: initial.location ?? {
      cityId: 'shenzhen',
      name: '深圳',
      latitude: 22.5431,
      longitude: 114.0579,
      timeZone: 'Asia/Shanghai'
    },
    date: initial.date ?? '2026-12-21',
    time: initial.time ?? '09:30'
  };
  let state;

  function calculate() {
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

  function publish() {
    calculate();
    for (const listener of listeners) listener(state);
  }

  calculate();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTime(time) {
      input = { ...input, time };
      publish();
    },
    setDate(date) {
      input = { ...input, date };
      publish();
    },
    setLocation(location) {
      input = { ...input, location: { ...location } };
      publish();
    }
  };
}
