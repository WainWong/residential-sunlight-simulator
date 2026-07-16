import { getSolarPosition } from '../../domain/solar/getSolarPosition.js';
import { floorBaseY } from '../../domain/buildings/floorMath.js';
import {
  buildRoomSimulationGeometry,
  evaluateRoomDirectSun
} from '../../domain/simulation/evaluateRoomDirectSun.js';

export function timeToMinute(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minuteToTime(minute) {
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function collectRooms(project) {
  const options = [];
  const map = new Map();
  for (const building of project.buildings) {
    const rooms = building.rooms ?? [];
    rooms.forEach((room, index) => {
      const name = room.name?.trim() || `房间 ${index + 1}`;
      options.push({ id: room.id, name, buildingId: building.id });
      map.set(room.id, { building, room });
    });
  }
  return { options, map };
}


export function createSimulationController(store, { analysisClientFactory = null } = {}) {
  const listeners = new Set();
  let state;
  let client = null;
  let daily = null;
  let dailyFailure = null;
  let dailySeq = 0;
  let dailyTimer = null;

  function dailyKey(project, activeId) {
    return JSON.stringify([activeId, project.simulation.date, project.location,
      project.buildings.map(building => [building.id, building.revision])]);
  }

  function requestDaily(project, building, room, key) {
    if (!analysisClientFactory) return;
    client ??= analysisClientFactory();
    clearTimeout(dailyTimer);
    dailyTimer = setTimeout(() => {
      dailySeq += 1;
      const mine = dailySeq;
      const baseY = floorBaseY({ floor: room.floor, ...building.params }) + (room.sampleHeight ?? 0);
      const geometry = buildRoomSimulationGeometry(project);
      client.analyze({
        location: project.location,
        localDate: project.simulation.date,
        area: room,
        openings: geometry.openings,
        obstacles: geometry.obstacles,
        frame: { rotation: building.rotation, position: building.position, baseY }
      }).then(result => {
        if (mine !== dailySeq) return;
        daily = { key, intervals: result.intervals, totalMinutes: result.totalMinutes };
        dailyFailure = null;
        update();
      }).catch(error => {
        if (mine !== dailySeq) return;
        dailyFailure = {
          key,
          message: error instanceof Error ? error.message : String(error)
        };
        update();
      });
    }, 250);
  }

  function calculate() {
    const project = store.getState();
    const time = project.simulation.time;
    const solar = getSolarPosition({
      ...project.location, localDate: project.simulation.date, localTime: time
    });
    const { options, map } = collectRooms(project);
    const requested = project.simulation.activeRoomId;
    const activeId = map.has(requested) ? requested : (options[0]?.id ?? null);
    const base = {
      location: project.location,
      date: project.simulation.date,
      time,
      minute: timeToMinute(time),
      solar,
      activeRoomId: activeId,
      roomOptions: options,
      intervals: null,
      totalMinutes: null,
      dailyError: null
    };
    if (!activeId) {
      state = { ...base, noRoom: true, hasDirectSun: false, litRatio: 0, litSampleIds: [] };
      return;
    }
    const { building, room } = map.get(activeId);
    const key = dailyKey(project, activeId);
    if (daily?.key === key) {
      base.intervals = daily.intervals;
      base.totalMinutes = daily.totalMinutes;
    } else if (dailyFailure?.key === key) {
      base.dailyError = dailyFailure.message;
    } else requestDaily(project, building, room, key);

    let result;
    if (!solar.aboveHorizon) result = { hasDirectSun: false, litRatio: 0, litSampleIds: [] };
    else result = evaluateRoomDirectSun({
      project, activeRoomId: activeId,
      sunDirection: [solar.direction.x, solar.direction.y, solar.direction.z]
    });
    state = { ...base, noRoom: false, ...result };
  }

  function update() {
    calculate();
    for (const listener of listeners) listener(state);
  }
  calculate();
  const unsubscribeStore = store.subscribe(update);

  function patchSimulation(label, patch) {
    store.execute({ label, apply: project => ({
      ...project, simulation: { ...project.simulation, ...patch }
    }) });
  }

  function setActiveRoom(activeRoomId) {
    patchSimulation('切换分析房间', { activeRoomId });
  }

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setTime(time) { patchSimulation('修改模拟时间', { time }); },
    setDate(date) { patchSimulation('修改模拟日期', { date }); },
    setActiveRoom,
    dispose() {
      unsubscribeStore(); listeners.clear(); clearTimeout(dailyTimer); client?.dispose();
    }
  };
}
