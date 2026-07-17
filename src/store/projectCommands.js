import {
  createBuildingParams,
  normalizeBuildingParams
} from '../domain/buildings/buildingTypes.js';
import { reprojectBuildingOpenings } from '../domain/openings/openingGeometry.js';
import { validateBuildingRooms } from '../domain/rooms/roomGeometry.js';

const normalizeRotation = value => ((Number(value) % 360) + 360) % 360;
const fallbackId = () => `building-${Date.now().toString(36)}`;
const DEFAULT_POSITION = Object.freeze({ x: 0, z: 0 });
const DEFAULT_VERTICAL_PARAMS = Object.freeze({ floors: 10, floorHeight: 3 });

export function createAddBuildingCommand(overrides = {}) {
  return {
    label: '添加建筑',
    apply(state) {
      const id = overrides.id ?? globalThis.crypto?.randomUUID?.() ?? fallbackId();
      const template = overrides.template ?? 'bar';
      let params;
      try {
        params = createBuildingParams({
          currentParams: DEFAULT_VERTICAL_PARAMS,
          templateId: template,
          overrides: overrides.params
        });
      } catch {
        return null;
      }
      const building = {
        id,
        name: overrides.name ?? `住宅 ${state.buildings.length + 1}`,
        template,
        revision: 1,
        position: { ...DEFAULT_POSITION, ...(overrides.position ?? {}) },
        rotation: normalizeRotation(overrides.rotation ?? 0),
        params,
        rooms: structuredClone(overrides.rooms ?? []),
        openings: structuredClone(overrides.openings ?? [])
      };
      return {
        ...state,
        buildings: [...state.buildings, building],
        view: { ...state.view, phase: 'building', selection: { kind: 'building', id }, roomFocus: null, roomEditing: null }
      };
    }
  };
}

export function createUpdateBuildingCommand(buildingId, patch = {}, label = '修改建筑') {
  return {
    label,
    apply(state) {
      const building = state.buildings.find(item => item.id === buildingId);
      if (!building) return null;
      const template = patch.template ?? building.template;
      let params;
      try {
        params = template === building.template
          ? normalizeBuildingParams(template, { ...building.params, ...(patch.params ?? {}) })
          : createBuildingParams({
              currentParams: building.params,
              templateId: template,
              overrides: patch.params
            });
      } catch {
        return null;
      }
      const updated = {
        ...building,
        ...patch,
        id: building.id,
        template,
        revision: (building.revision ?? 0) + 1,
        position: { ...building.position, ...(patch.position ?? {}) },
        rotation: patch.rotation == null ? building.rotation : normalizeRotation(patch.rotation),
        params,
        rooms: patch.rooms ?? building.rooms,
        openings: patch.openings ?? building.openings
      };
      const changesLocalGeometry = ['template', 'params', 'rooms', 'openings']
        .some(field => Object.hasOwn(patch, field));
      let validUpdate = updated;
      if (changesLocalGeometry) {
        if (!validateBuildingRooms(updated).ok) return null;
        const openings = reprojectBuildingOpenings(updated);
        if (openings.some(opening => opening.status === 'invalid')) return null;
        validUpdate = { ...updated, openings };
      }
      return {
        ...state,
        buildings: state.buildings.map(item => item.id === buildingId ? validUpdate : item)
      };
    }
  };
}

export function createRemoveBuildingCommand(buildingId) {
  return {
    label: '删除建筑',
    apply(state) {
      if (!state.buildings.some(building => building.id === buildingId)) return null;
      const roomIds = new Set(state.buildings.find(building => building.id === buildingId)?.rooms?.map(room => room.id) ?? []);
      return {
        ...state,
        buildings: state.buildings.filter(building => building.id !== buildingId),
        simulation: {
          ...state.simulation,
          activeRoomId: roomIds.has(state.simulation.activeRoomId) ? null : state.simulation.activeRoomId
        },
        view: { ...state.view, selection: null, roomFocus: null, roomEditing: null, interiorRoomId: null }
      };
    }
  };
}

export function createClearBuildingsCommand() {
  return {
    label: '清空场景',
    apply(state) {
      return {
        ...state,
        buildings: [],
        simulation: { ...state.simulation, activeRoomId: null },
        view: { ...state.view, selection: null, roomFocus: null, roomEditing: null, interiorRoomId: null, phase: 'building' }
      };
    }
  };
}

export function createSetLocationCommand(location) {
  return {
    label: '修改项目位置',
    apply(state) {
      return { ...state, location: structuredClone(location) };
    }
  };
}
