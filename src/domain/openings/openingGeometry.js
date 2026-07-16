import { deriveWalls } from '../walls/deriveWalls.js';

const PRESETS = {
  window: { width: 1.8, bottom: 0.9, top: 2.1, fill: 'glass' },
  floorWindow: { width: 2.4, bottom: 0.1, top: 2.5, fill: 'glass' },
  doorway: { width: 0.9, bottom: 0, top: 2.1, fill: 'open' },
  parapet: { width: 3, bottom: 1.1, top: 3, fill: 'open' },
  custom: { width: 1.8, bottom: 0.9, top: 2.1, fill: 'glass' }
};

const EPS = 1e-6;
const fallbackId = () => `opening-${Date.now().toString(36)}`;
const clonePoint = point => Array.isArray(point) ? [...point] : null;

function sameIds(first = [], second = []) {
  if (first.length !== second.length) return false;
  const expected = new Set(first);
  return second.every(id => expected.has(id));
}

function wallAnchor(wall, centerU) {
  return {
    wallId: wall.id,
    centerU,
    start: clonePoint(wall.start),
    end: clonePoint(wall.end),
    normal: clonePoint(wall.normal),
    roomIds: [...wall.roomIds]
  };
}

function anchorPoint(anchor, fallbackCenterU = 0.5) {
  if (!anchor?.start || !anchor?.end) return null;
  const u = anchor.centerU ?? fallbackCenterU;
  return [
    anchor.start[0] + (anchor.end[0] - anchor.start[0]) * u,
    anchor.start[1] + (anchor.end[1] - anchor.start[1]) * u
  ];
}

function distanceToWallMidpoint(point, wall) {
  if (!point) return 0;
  const x = (wall.start[0] + wall.end[0]) / 2;
  const z = (wall.start[1] + wall.end[1]) / 2;
  return Math.hypot(point[0] - x, point[1] - z);
}

function matchingWall(opening, walls) {
  const exact = walls.find(wall => wall.id === opening.wallAnchor?.wallId);
  if (exact) return exact;
  const anchor = opening.wallAnchor;
  const candidates = walls.filter(wall => {
    if (!sameIds(wall.roomIds, anchor?.roomIds ?? opening.connectedRoomIds)) return false;
    if (!anchor?.normal) return false;
    const dot = wall.normal[0] * anchor.normal[0] + wall.normal[1] * anchor.normal[1];
    return Math.abs(dot) > 1 - EPS;
  });
  const point = anchorPoint(anchor, opening.bounds?.centerU);
  return candidates.sort((a, b) => distanceToWallMidpoint(point, a) - distanceToWallMidpoint(point, b))[0] ?? null;
}

export function openingFitsWall(opening, wall, floorHeight) {
  const bounds = opening.bounds;
  if (!bounds || !wall?.length) return false;
  const center = bounds.centerU * wall.length;
  return bounds.width > 0
    && center - bounds.width / 2 >= -EPS
    && center + bounds.width / 2 <= wall.length + EPS
    && bounds.bottom >= -EPS
    && bounds.top > bounds.bottom + EPS
    && bounds.top <= floorHeight + EPS;
}

export function openingsOverlap(first, second, wall) {
  if (!wall || first.id === second.id) return false;
  if (first.wallAnchor?.wallId !== wall.id || second.wallAnchor?.wallId !== wall.id) return false;
  const firstCenter = first.bounds.centerU * wall.length;
  const secondCenter = second.bounds.centerU * wall.length;
  const separatedHorizontally = firstCenter + first.bounds.width / 2 <= secondCenter - second.bounds.width / 2 + EPS
    || secondCenter + second.bounds.width / 2 <= firstCenter - first.bounds.width / 2 + EPS;
  const separatedVertically = first.bounds.top <= second.bounds.bottom + EPS
    || second.bounds.top <= first.bounds.bottom + EPS;
  return !separatedHorizontally && !separatedVertically;
}

export function createOpeningFromPreset({ wall, preset, centerU = 0.5, floorHeight = 3, id = null }) {
  const definition = PRESETS[preset] ?? PRESETS.custom;
  const bounds = {
    centerU: Math.max(0, Math.min(1, centerU)),
    width: definition.width,
    bottom: definition.bottom,
    top: Math.min(definition.top, floorHeight)
  };
  const opening = {
    id: id ?? globalThis.crypto?.randomUUID?.() ?? fallbackId(),
    floor: wall.floor,
    connectedRoomIds: [...wall.roomIds],
    wallAnchor: wallAnchor(wall, bounds.centerU),
    preset: PRESETS[preset] ? preset : 'custom',
    bounds,
    fill: definition.fill,
    transmittance: null,
    status: 'valid'
  };
  if (!openingFitsWall(opening, wall, floorHeight)) opening.status = 'invalid';
  return opening;
}

export function reprojectOpening(opening, wall, floorHeight) {
  if (!wall) return { ...opening, status: 'invalid' };
  let centerU = opening.bounds.centerU;
  const anchor = opening.wallAnchor;
  if (anchor?.start && anchor?.end) {
    const oldDirection = [anchor.end[0] - anchor.start[0], anchor.end[1] - anchor.start[1]];
    const newDirection = [wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]];
    if (oldDirection[0] * newDirection[0] + oldDirection[1] * newDirection[1] < 0) centerU = 1 - centerU;
  }
  const projected = {
    ...opening,
    connectedRoomIds: [...wall.roomIds],
    wallAnchor: wallAnchor(wall, centerU),
    bounds: { ...opening.bounds, centerU }
  };
  projected.status = openingFitsWall(projected, wall, floorHeight) ? 'valid' : 'invalid';
  return projected;
}

export function reprojectBuildingOpenings(building) {
  const wallsByFloor = new Map();
  const wallsFor = floor => {
    if (!wallsByFloor.has(floor)) wallsByFloor.set(floor, deriveWalls(building, floor));
    return wallsByFloor.get(floor);
  };
  const projected = (building.openings ?? []).map(opening => {
    const wall = matchingWall(opening, wallsFor(opening.floor));
    return reprojectOpening(opening, wall, building.params.floorHeight);
  });
  return projected.map((opening, index) => {
    if (opening.status === 'invalid') return opening;
    const wall = wallsFor(opening.floor).find(candidate => candidate.id === opening.wallAnchor.wallId);
    const overlaps = projected.some((candidate, candidateIndex) =>
      candidateIndex !== index && openingsOverlap(opening, candidate, wall));
    return overlaps ? { ...opening, status: 'invalid' } : opening;
  });
}

export function openingPresetDefinitions() {
  return structuredClone(PRESETS);
}
