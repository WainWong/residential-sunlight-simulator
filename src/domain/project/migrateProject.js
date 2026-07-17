import { completeMissingBuildingParams } from '../buildings/buildingTypes.js';
import { createFootprint } from '../buildings/createFootprint.js';
import { createWallSegments } from '../buildings/createWallSegments.js';
import { openingFitsWall } from '../openings/openingGeometry.js';
import { deriveWalls } from '../walls/deriveWalls.js';

const CURRENT_SCHEMA_VERSION = 2;

function fallbackRoomName(index) {
  return `房间 ${index + 1}`;
}

function migrateRoom(area, index) {
  return {
    id: area.id,
    floor: area.floor ?? 1,
    name: area.name?.trim() || fallbackRoomName(index),
    rects: Array.isArray(area.rects) ? area.rects.map(rect => ({ ...rect })) : [],
    objects: Array.isArray(area.objects) ? structuredClone(area.objects) : []
  };
}

function connectedRoomsForLegacyOpening(areas, openingId) {
  return areas
    .filter(area => (area.openingIds ?? []).includes(openingId))
    .map(area => area.id);
}

const LEGACY_NORMALS = {
  north: [0, 1],
  south: [0, -1],
  east: [1, 0],
  west: [-1, 0]
};

function legacyWallNormal(building, wallId) {
  const reference = String(wallId ?? '').toLowerCase();
  const direction = Object.keys(LEGACY_NORMALS).find(name => reference.includes(name));
  if (direction) return LEGACY_NORMALS[direction];
  const footprintWall = createWallSegments(createFootprint(building.template, building.params))
    .find(wall => wall.id === wallId);
  return footprintWall?.normal ?? null;
}

function resolveLegacyWall(building, opening, roomIds) {
  const walls = deriveWalls(building, opening.floor ?? 1);
  const exact = walls.find(wall => wall.id === opening.wallId);
  if (exact) return exact;
  const normal = legacyWallNormal(building, opening.wallId);
  if (!normal) return null;
  const connected = walls.filter(wall => wall.roomIds.some(roomId => roomIds.includes(roomId)));
  const candidates = connected.length > 0 ? connected : walls;
  return candidates.sort((first, second) => {
    const firstDot = first.normal[0] * normal[0] + first.normal[1] * normal[1];
    const secondDot = second.normal[0] * normal[0] + second.normal[1] * normal[1];
    return secondDot - firstDot || second.length - first.length;
  })[0] ?? null;
}

function migrateOpening(opening, areas, building) {
  const preset = opening.type === 'balcony' ? 'parapet' : (opening.type ?? 'custom');
  const bottom = opening.sillHeight ?? 0;
  const top = bottom + (opening.height ?? 0);
  const connectedRoomIds = connectedRoomsForLegacyOpening(areas, opening.id);
  const wall = resolveLegacyWall(building, opening, connectedRoomIds);
  const centerU = Number.isFinite(opening.centerU) ? opening.centerU : 0.5;
  const migrated = {
    id: opening.id,
    floor: opening.floor ?? 1,
    connectedRoomIds: wall ? [...wall.roomIds] : connectedRoomIds,
    wallAnchor: wall ? {
      wallId: wall.id,
      centerU,
      start: [...wall.start],
      end: [...wall.end],
      normal: [...wall.normal],
      roomIds: [...wall.roomIds]
    } : { wallId: null, centerU },
    preset,
    bounds: {
      centerU,
      width: opening.width ?? 0,
      bottom,
      top
    },
    fill: preset === 'window' || preset === 'floorWindow' ? 'glass' : 'open',
    transmittance: null,
    status: 'invalid'
  };
  if (wall && openingFitsWall(migrated, wall, building.params.floorHeight)) migrated.status = 'valid';
  return migrated;
}

function materializeLegacyApertures(building, explicitOpenings) {
  const coveredWallIds = new Set(explicitOpenings
    .filter(opening => opening.status === 'valid')
    .map(opening => opening.wallAnchor?.wallId)
    .filter(Boolean));
  const floors = new Set((building.rooms ?? []).map(room => room.floor));
  const apertures = [];
  for (const floor of floors) {
    for (const wall of deriveWalls(building, floor)) {
      if (wall.kind !== 'exterior' || coveredWallIds.has(wall.id)) continue;
      apertures.push({
        id: `legacy-aperture:${wall.roomIds[0]}:${wall.id}`,
        floor,
        connectedRoomIds: [...wall.roomIds],
        wallAnchor: {
          wallId: wall.id,
          centerU: 0.5,
          start: [...wall.start],
          end: [...wall.end],
          normal: [...wall.normal],
          roomIds: [...wall.roomIds]
        },
        preset: 'custom',
        bounds: {
          centerU: 0.5,
          width: wall.length,
          bottom: 0,
          top: building.params.floorHeight
        },
        fill: 'open',
        transmittance: null,
        status: 'valid'
      });
    }
  }
  return apertures;
}

function normalizeV2(project) {
  const normalized = structuredClone(project);
  normalized.schemaVersion = 2;
  normalized.buildings ??= [];
  for (const building of normalized.buildings) {
    try {
      building.params = completeMissingBuildingParams(building.template, building.params);
    } catch {
      // Validation reports unsupported templates after migration.
    }
    building.rooms = (building.rooms ?? []).map((room, index) => ({
      id: room.id,
      floor: room.floor ?? 1,
      name: room.name?.trim() || fallbackRoomName(index),
      rects: Array.isArray(room.rects) ? room.rects.map(rect => ({ ...rect })) : [],
      objects: Array.isArray(room.objects) ? structuredClone(room.objects) : []
    }));
    building.openings ??= [];
    delete building.observationAreas;
  }
  normalized.simulation ??= {};
  normalized.simulation.activeRoomId ??= null;
  delete normalized.simulation.activeAreaId;
  normalized.view = {
    camera: normalized.view?.camera ?? null,
    activePanel: normalized.view?.activePanel ?? 'buildings',
    wizardComplete: normalized.view?.wizardComplete ?? false,
    phase: normalized.view?.phase === 'sunlight' ? 'sunlight' : 'building',
    selection: normalized.view?.selection ?? null,
    roomFocus: null,
    roomEditing: null,
    roomTool: 'select',
    interiorRoomId: normalized.view?.interiorRoomId ?? null
  };
  return normalized;
}

function migrateV1(rawProject) {
  const project = structuredClone(rawProject);
  project.schemaVersion = 2;
  for (const building of project.buildings ?? []) {
    const areas = building.observationAreas ?? [];
    building.rooms = areas.map(migrateRoom);
    const explicitOpenings = (building.openings ?? [])
      .map(opening => migrateOpening(opening, areas, building));
    building.openings = [
      ...explicitOpenings, ...materializeLegacyApertures(building, explicitOpenings)
    ];
    delete building.observationAreas;
  }

  const activeRoomId = project.simulation?.activeAreaId ?? null;
  project.simulation = { ...(project.simulation ?? {}), activeRoomId };
  delete project.simulation.activeAreaId;

  const oldView = project.view ?? {};
  const interiorRoomId = oldView.interior?.areaId ?? null;
  const selectedBuildingId = oldView.selectedBuildingId ?? null;
  project.view = {
    camera: oldView.camera ?? null,
    activePanel: oldView.activePanel ?? 'buildings',
    wizardComplete: oldView.wizardComplete ?? false,
    phase: oldView.phase === 'present' ? 'sunlight' : 'building',
    selection: interiorRoomId
      ? { kind: 'room', id: interiorRoomId, buildingId: oldView.interior?.buildingId ?? selectedBuildingId }
      : (selectedBuildingId ? { kind: 'building', id: selectedBuildingId } : null),
    roomEditing: null,
    interiorRoomId
  };
  return normalizeV2(project);
}

export function migrateProject(rawProject) {
  const version = rawProject?.schemaVersion;
  if (version === 1) return migrateV1(rawProject);
  if (version === CURRENT_SCHEMA_VERSION) return normalizeV2(rawProject);
  throw new Error(`不支持的项目版本：${String(version)}`);
}
