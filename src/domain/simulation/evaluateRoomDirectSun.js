import { floorBaseY } from '../buildings/floorMath.js';
import { rotateLocalToWorld } from '../buildings/wallGeometry.js';
import { buildObstacles } from './buildObstacles.js';
import { buildRoomOpeningPortals } from './buildRoomOpeningPortals.js';
import { buildRoomWallQuads } from './buildRoomWallQuads.js';
import { evaluateDirectSun } from './evaluateDirectSun.js';

export function findRoom(project, roomId) {
  for (const building of project.buildings ?? []) {
    const room = (building.rooms ?? []).find(candidate => candidate.id === roomId);
    if (room) return { building, room };
  }
  return null;
}

export function buildRoomSimulationGeometry(project) {
  return {
    openings: (project.buildings ?? []).flatMap(buildRoomOpeningPortals),
    obstacles: [
      ...buildObstacles(project.buildings ?? []),
      ...(project.buildings ?? []).flatMap(buildRoomWallQuads)
    ]
  };
}

export function evaluateRoomDirectSun({ project, activeRoomId, sunDirection }) {
  const target = findRoom(project, activeRoomId);
  if (!target) return { hasDirectSun: false, litRatio: 0, litSampleIds: [], openingHits: {} };
  const { building, room } = target;
  const baseY = floorBaseY({ floor: room.floor, ...building.params }) + (room.sampleHeight ?? 0);
  const transform = ([x, , z]) => {
    const [wx, wz] = rotateLocalToWorld([x, z], building.rotation);
    return [wx + building.position.x, baseY, wz + building.position.z];
  };
  const geometry = buildRoomSimulationGeometry(project);
  return evaluateDirectSun({ area: room, ...geometry, sunDirection, transform });
}
