import { createFootprint } from '../buildings/createFootprint.js';

const EPS = 1e-6;
const q = value => Number(value.toFixed(6));

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || EPS) + xi) inside = !inside;
  }
  return inside;
}

function footprintContains(footprint, x, z) {
  if (Array.isArray(footprint)) return pointInRing(x, z, footprint);
  return pointInRing(x, z, footprint.outer)
    && !(footprint.holes ?? []).some(hole => pointInRing(x, z, hole));
}

function footprintPoints(footprint) {
  return Array.isArray(footprint)
    ? footprint
    : [...footprint.outer, ...(footprint.holes ?? []).flat()];
}

function roomAt(rooms, x, z) {
  return rooms.find(room => (room.rects ?? []).some(rect =>
    x > Math.min(rect.x0, rect.x1) + EPS && x < Math.max(rect.x0, rect.x1) - EPS
    && z > Math.min(rect.z0, rect.z1) + EPS && z < Math.max(rect.z0, rect.z1) - EPS
  )) ?? null;
}

function canonicalKey(start, end) {
  const a = `${q(start[0])},${q(start[1])}`;
  const b = `${q(end[0])},${q(end[1])}`;
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function makeWall({ floor, start, end, normal, roomIds, kind }) {
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  return {
    id: `wall:${floor}:${canonicalKey(start, end)}`,
    floor, start, end, normal, length, roomIds, kind
  };
}

function classify(sideA, sideB, insideA, insideB) {
  if (!sideA && !sideB) return null;
  if (sideA && sideB && sideA.id === sideB.id) return null;
  if (sideA && sideB) return { kind: 'shared', roomIds: [sideA.id, sideB.id] };
  const room = sideA ?? sideB;
  const otherInside = sideA ? insideB : insideA;
  return { kind: otherInside ? 'sealed' : 'exterior', roomIds: [room.id] };
}

export function deriveWalls(building, floor) {
  const rooms = (building.rooms ?? []).filter(room => room.floor === floor);
  if (rooms.length === 0) return [];
  const footprint = createFootprint(building.template, building.params);
  const points = footprintPoints(footprint);
  const xs = [...new Set([
    ...points.map(point => point[0]),
    ...rooms.flatMap(room => room.rects.flatMap(rect => [rect.x0, rect.x1]))
  ].map(q))].sort((a, b) => a - b);
  const zs = [...new Set([
    ...points.map(point => point[1]),
    ...rooms.flatMap(room => room.rects.flatMap(rect => [rect.z0, rect.z1]))
  ].map(q))].sort((a, b) => a - b);
  const walls = [];

  for (const x of xs) {
    for (let i = 0; i < zs.length - 1; i += 1) {
      const z0 = zs[i]; const z1 = zs[i + 1]; const mid = (z0 + z1) / 2;
      const delta = Math.max(EPS * 10, Math.min(z1 - z0, 1) * 1e-4);
      const left = roomAt(rooms, x - delta, mid);
      const right = roomAt(rooms, x + delta, mid);
      const info = classify(left, right, footprintContains(footprint, x - delta, mid), footprintContains(footprint, x + delta, mid));
      if (!info) continue;
      const pointsForWall = left ? { start: [x, z0], end: [x, z1], normal: [1, 0] }
        : { start: [x, z1], end: [x, z0], normal: [-1, 0] };
      walls.push(makeWall({ floor, ...pointsForWall, ...info }));
    }
  }
  for (const z of zs) {
    for (let i = 0; i < xs.length - 1; i += 1) {
      const x0 = xs[i]; const x1 = xs[i + 1]; const mid = (x0 + x1) / 2;
      const delta = Math.max(EPS * 10, Math.min(x1 - x0, 1) * 1e-4);
      const bottom = roomAt(rooms, mid, z - delta);
      const top = roomAt(rooms, mid, z + delta);
      const info = classify(bottom, top, footprintContains(footprint, mid, z - delta), footprintContains(footprint, mid, z + delta));
      if (!info) continue;
      const pointsForWall = bottom ? { start: [x1, z], end: [x0, z], normal: [0, 1] }
        : { start: [x0, z], end: [x1, z], normal: [0, -1] };
      walls.push(makeWall({ floor, ...pointsForWall, ...info }));
    }
  }
  return walls;
}

export function findDerivedWall(building, floor, wallId) {
  return deriveWalls(building, floor).find(wall => wall.id === wallId) ?? null;
}
