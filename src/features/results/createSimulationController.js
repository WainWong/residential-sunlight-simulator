import { getSolarPosition } from '../../domain/solar/getSolarPosition.js';
import { floorBaseY } from '../../domain/buildings/floorMath.js';
import { rotateLocalToWorld } from '../../domain/buildings/wallGeometry.js';
import { buildObstacles } from '../../domain/simulation/buildObstacles.js';
import { buildAreaWallQuads } from '../../domain/simulation/buildAreaWallQuads.js';
import { deriveAperturesFromArea } from '../../domain/simulation/deriveApertures.js';
import { evaluateDirectSun } from '../../domain/simulation/evaluateDirectSun.js';
import { areaLabel } from '../../domain/buildings/areaEditing.js';

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
    (building.observationAreas ?? []).forEach((area, index) => {
      options.push({ id: area.id, name: areaLabel(area, index) });
      map.set(area.id, { building, area });
    });
  }
  return { options, map };
}

function resolveDirectSun({ project, building, area }) {
  const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
  const transform = ([lx, , lz]) => {
    const [wx, wz] = rotateLocalToWorld([lx, lz], building.rotation);
    return [wx + building.position.x, baseY, wz + building.position.z];
  };
  const { portals } = deriveAperturesFromArea(building, area);
  // All walls stay in the obstacle set — light passes only through the portal
  // openings (firstBlockingDistance excuses hits inside a portal). The area's
  // own partition walls block light too.
  const obstacles = [
    ...buildObstacles(project.buildings),
    ...buildAreaWallQuads(building, area)
  ];

  return { transform, portals, obstacles };
}

export function createSimulationController(store, { analysisClientFactory = null } = {}) {
  const listeners = new Set();
  let state;

  // Full-day direct-sun analysis runs in the worker; latest-wins + debounce.
  let client = null;
  let daily = null; // { key, intervals, totalMinutes }
  let dailySeq = 0;
  let dailyTimer = null;

  function dailyKey(project, activeId) {
    return JSON.stringify([
      activeId,
      project.simulation.date,
      project.location,
      project.buildings.map(b => [b.id, b.revision])
    ]);
  }

  function requestDaily(project, building, area, key) {
    if (!analysisClientFactory) return;
    client ??= analysisClientFactory();
    clearTimeout(dailyTimer);
    dailyTimer = setTimeout(() => {
      dailySeq += 1;
      const mine = dailySeq;
      const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
      const { portals } = deriveAperturesFromArea(building, area);
      const obstacles = [
        ...buildObstacles(project.buildings),
        ...buildAreaWallQuads(building, area)
      ];
      client.analyze({
        location: project.location,
        localDate: project.simulation.date,
        area,
        openings: portals,
        obstacles,
        frame: {
          rotation: building.rotation,
          position: { x: building.position.x, z: building.position.z },
          baseY
        }
      }).then(result => {
        if (mine !== dailySeq) return; // stale
        daily = { key, intervals: result.intervals, totalMinutes: result.totalMinutes };
        update();
      }).catch(() => {});
    }, 250);
  }

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

    // Merge in the worker's full-day result when it matches the current
    // area/date/geometry; otherwise leave placeholders and refresh it.
    const key = dailyKey(project, activeId);
    if (daily?.key === key) {
      base.intervals = daily.intervals;
      base.totalMinutes = daily.totalMinutes;
    } else {
      requestDaily(project, building, area, key);
    }

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
      clearTimeout(dailyTimer);
      client?.dispose();
    }
  };
}
