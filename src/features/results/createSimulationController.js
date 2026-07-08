import { getSolarPosition } from '../../domain/solar/getSolarPosition.js';
import { floorBaseY } from '../../domain/buildings/floorMath.js';
import { rotateLocalToWorld } from '../../domain/buildings/wallGeometry.js';
import { buildObstacles } from '../../domain/simulation/buildObstacles.js';
import { deriveAperturesFromArea } from '../../domain/simulation/deriveApertures.js';
import { evaluateDirectSun } from '../../domain/simulation/evaluateDirectSun.js';

export function timeToMinute(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minuteToTime(minute) {
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function collectAreas(project) {
  const options = [];
  const map = new Map();
  for (const building of project.buildings) {
    for (const area of building.observationAreas ?? []) {
      options.push({ id: area.id, name: area.name });
      map.set(area.id, { building, area });
    }
  }
  return { options, map };
}

function resolveDirectSun({ project, building, area }) {
  const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
  const transform = ([lx, , lz]) => {
    const [wx, wz] = rotateLocalToWorld([lx, lz], building.rotation);
    return [wx + building.position.x, baseY, wz + building.position.z];
  };
  const { portals, apertureWallIds } = deriveAperturesFromArea(building, area);
  const obstacles = buildObstacles(project.buildings, { excludeWallIds: apertureWallIds });

  return { transform, portals, obstacles };
}

export function createSimulationController(store) {
  const listeners = new Set();
  let state;

  function calculate() {
    const project = store.getState();
    const time = project.simulation.time;
    const minute = timeToMinute(time);
    const solar = getSolarPosition({
      ...project.location,
      localDate: project.simulation.date,
      localTime: time
    });
    const { options, map } = collectAreas(project);
    const activeId = map.has(project.simulation.activeAreaId)
      ? project.simulation.activeAreaId
      : (options[0]?.id ?? null);

    const base = {
      location: project.location,
      date: project.simulation.date,
      time,
      minute,
      solar,
      activeAreaId: activeId,
      areaOptions: options,
      intervals: null,
      totalMinutes: null
    };

    if (!activeId) {
      state = { ...base, noArea: true, hasDirectSun: false, litRatio: 0, litSampleIds: [] };
      return;
    }

    const { building, area } = map.get(activeId);
    const { transform, portals, obstacles } = resolveDirectSun({ project, building, area });

    const result = solar.aboveHorizon
      ? evaluateDirectSun({
          area,
          openings: portals,
          obstacles,
          sunDirection: [solar.direction.x, solar.direction.y, solar.direction.z],
          transform
        })
      : { hasDirectSun: false, litRatio: 0, litSampleIds: [] };

    state = {
      ...base,
      noArea: false,
      hasDirectSun: result.hasDirectSun,
      litRatio: result.litRatio,
      litSampleIds: result.litSampleIds
    };
  }

  function update() {
    calculate();
    for (const listener of listeners) listener(state);
  }

  calculate();
  const unsubscribeStore = store.subscribe(update);

  function patchSimulation(label, patch) {
    store.execute({
      label,
      apply: project => ({
        ...project,
        simulation: { ...project.simulation, ...patch }
      })
    });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTime(time) {
      patchSimulation('修改模拟时间', { time });
    },
    setDate(date) {
      patchSimulation('修改模拟日期', { date });
    },
    setActiveArea(activeAreaId) {
      patchSimulation('切换观察区', { activeAreaId });
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
