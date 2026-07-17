import { clipRectToFootprint } from '../domain/buildings/footprintClip.js';
import { reprojectBuildingOpenings } from '../domain/openings/openingGeometry.js';
import { nextRoomName, normalizeRects, validateRoomRects } from '../domain/rooms/roomGeometry.js';

const fallbackId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const newId = prefix => globalThis.crypto?.randomUUID?.() ?? fallbackId(prefix);

function findBuilding(state, buildingId) {
  return state.buildings.find(building => building.id === buildingId) ?? null;
}

function updateBuilding(state, buildingId, update) {
  return {
    ...state,
    buildings: state.buildings.map(building => building.id !== buildingId ? building : {
      ...update(building),
      revision: (building.revision ?? 0) + 1
    })
  };
}

function rectArea(rect) {
  return Math.abs((rect.x1 - rect.x0) * (rect.z1 - rect.z0));
}

function fitsFootprint(rect, building) {
  const pieces = clipRectToFootprint(rect, building.template, building.params);
  const clippedArea = pieces.reduce((sum, piece) => sum + rectArea(piece), 0);
  return Math.abs(clippedArea - rectArea(normalizeRects([rect])[0] ?? rect)) < 1e-6;
}

function roomsWithDraft(building, editing, rects) {
  const existing = (building.rooms ?? []).find(room => room.id === editing.roomId);
  const draft = existing
    ? { ...existing, floor: editing.floor, rects: structuredClone(rects) }
    : {
        id: editing.roomId, floor: editing.floor, name: editing.name ?? '',
        type: editing.type ?? null, rects: structuredClone(rects), objects: []
      };
  return existing
    ? building.rooms.map(room => room.id === draft.id ? draft : room)
    : [...(building.rooms ?? []), draft];
}

function openingsRemainValid(building, rooms) {
  if (!(building.openings ?? []).length) return true;
  return reprojectBuildingOpenings({ ...building, rooms }).every(opening => opening.status !== 'invalid');
}

export function createSelectEntityCommand(selection) {
  return {
    label: '选择对象',
    apply(state) {
      return { ...state, view: { ...state.view, selection: selection ? structuredClone(selection) : null } };
    }
  };
}

export function createStartRoomCommand(buildingId, floor = 1) {
  return {
    label: '开始添加房间',
    apply(state) {
      const building = findBuilding(state, buildingId);
      if (!building || floor < 1 || floor > building.params.floors) return null;
      return {
        ...state,
        view: {
          ...state.view,
          phase: 'room',
          selection: { kind: 'building', id: buildingId },
          roomEditing: {
            mode: 'create', buildingId, roomId: newId('room'), floor,
            rects: [], type: null, name: ''
          }
        }
      };
    }
  };
}

export function createStartRoomEditCommand(buildingId, roomId) {
  return {
    label: '开始编辑房间',
    apply(state) {
      const building = findBuilding(state, buildingId);
      const room = building?.rooms?.find(candidate => candidate.id === roomId);
      if (!building || !room) return null;
      return {
        ...state,
        view: {
          ...state.view,
          phase: 'room',
          selection: { kind: 'room', id: roomId, buildingId },
          roomEditing: {
            mode: 'edit', buildingId, roomId, floor: room.floor,
            rects: structuredClone(room.rects), type: room.type, name: room.name
          }
        }
      };
    }
  };
}

export function createAppendRoomRectCommand(rect) {
  return {
    label: '添加房间矩形',
    apply(state) {
      const editing = state.view.roomEditing;
      const building = editing && findBuilding(state, editing.buildingId);
      const normalized = normalizeRects([rect])[0];
      if (!editing || !building || !normalized || !fitsFootprint(normalized, building)) return null;
      const occupied = (building.rooms ?? [])
        .filter(room => room.floor === editing.floor && room.id !== editing.roomId)
        .flatMap(room => room.rects ?? []);
      const rects = [...editing.rects, normalized];
      const validity = validateRoomRects(rects, occupied);
      if (!validity.ok) return null;
      return {
        ...state,
        view: { ...state.view, roomEditing: { ...editing, rects } }
      };
    }
  };
}

export function createReplaceRoomRectsCommand(rects) {
  return {
    label: '调整房间轮廓',
    apply(state) {
      const editing = state.view.roomEditing;
      const building = editing && findBuilding(state, editing.buildingId);
      if (!editing || !building) return null;
      const normalized = normalizeRects(rects);
      const occupied = (building.rooms ?? [])
        .filter(room => room.floor === editing.floor && room.id !== editing.roomId)
        .flatMap(room => room.rects ?? []);
      if (normalized.some(rect => !fitsFootprint(rect, building)) || !validateRoomRects(normalized, occupied).ok) return null;
      if (!openingsRemainValid(building, roomsWithDraft(building, editing, normalized))) return null;
      return { ...state, view: { ...state.view, roomEditing: { ...editing, rects: normalized } } };
    }
  };
}

export function createCancelRoomCommand() {
  return {
    label: '取消房间编辑',
    apply(state) {
      if (!state.view.roomEditing) return null;
      return { ...state, view: { ...state.view, roomEditing: null } };
    }
  };
}

export function createFinishRoomCommand() {
  return {
    label: '完成房间',
    apply(state) {
      const editing = state.view.roomEditing;
      const building = editing && findBuilding(state, editing.buildingId);
      if (!editing || !building || editing.rects.length === 0) return null;
      const currentRooms = building.rooms ?? [];
      const existing = currentRooms.find(room => room.id === editing.roomId);
      const room = {
        id: editing.roomId,
        floor: editing.floor,
        name: editing.name?.trim() || existing?.name || nextRoomName(currentRooms.filter(item => item.id !== editing.roomId), editing.type),
        type: editing.type ?? existing?.type ?? null,
        rects: structuredClone(editing.rects),
        objects: structuredClone(existing?.objects ?? [])
      };
      const rooms = existing
        ? building.rooms.map(item => item.id === room.id ? room : item)
        : [...(building.rooms ?? []), room];
      const openings = reprojectBuildingOpenings({ ...building, rooms });
      if (openings.some(opening => opening.status === 'invalid')) return null;
      const next = updateBuilding(state, editing.buildingId, current => ({
        ...current,
        rooms,
        openings
      }));
      return {
        ...next,
        simulation: { ...next.simulation, activeRoomId: room.id },
        view: {
          ...next.view,
          roomEditing: null,
          selection: { kind: 'room', id: room.id, buildingId: editing.buildingId }
        }
      };
    }
  };
}

export function createUpdateRoomCommand(buildingId, roomId, patch) {
  return {
    label: '修改房间',
    apply(state) {
      const building = findBuilding(state, buildingId);
      if (!building?.rooms?.some(room => room.id === roomId)) return null;
      return updateBuilding(state, buildingId, current => ({
        ...current,
        rooms: current.rooms.map(room => room.id === roomId ? { ...room, ...structuredClone(patch) } : room)
      }));
    }
  };
}

export function createRemoveRoomCommand(buildingId, roomId) {
  return {
    label: '删除房间',
    apply(state) {
      const building = findBuilding(state, buildingId);
      if (!building?.rooms?.some(room => room.id === roomId)) return null;
      const next = updateBuilding(state, buildingId, current => ({
        ...current,
        rooms: current.rooms.filter(room => room.id !== roomId),
        openings: (current.openings ?? []).filter(opening => !(opening.connectedRoomIds ?? []).includes(roomId))
      }));
      return {
        ...next,
        simulation: { ...next.simulation, activeRoomId: next.simulation.activeRoomId === roomId ? null : next.simulation.activeRoomId },
        view: { ...next.view, selection: next.view.selection?.id === roomId ? { kind: 'building', id: buildingId } : next.view.selection }
      };
    }
  };
}

export function createAddOpeningCommand(buildingId, opening) {
  return {
    label: '添加墙上开口',
    apply(state) {
      const building = findBuilding(state, buildingId);
      if (!building) return null;
      const openings = reprojectBuildingOpenings({
        ...building,
        openings: [...(building.openings ?? []), structuredClone(opening)]
      });
      if (openings.some(candidate => candidate.status === 'invalid')) return null;
      return updateBuilding(state, buildingId, building => ({
        ...building,
        openings
      }));
    }
  };
}

export function createUpdateOpeningCommand(buildingId, openingId, patch) {
  return {
    label: '修改墙上开口',
    apply(state) {
      const building = findBuilding(state, buildingId);
      if (!building?.openings?.some(opening => opening.id === openingId)) return null;
      const openings = reprojectBuildingOpenings({
        ...building,
        openings: building.openings.map(opening => opening.id !== openingId ? opening : {
          ...opening,
          ...structuredClone(patch),
          bounds: patch.bounds ? { ...opening.bounds, ...structuredClone(patch.bounds) } : opening.bounds,
          wallAnchor: patch.wallAnchor
            ? { ...opening.wallAnchor, ...structuredClone(patch.wallAnchor) }
            : opening.wallAnchor
        })
      });
      if (openings.some(opening => opening.status === 'invalid')) return null;
      return updateBuilding(state, buildingId, current => ({
        ...current,
        openings
      }));
    }
  };
}

export function createRemoveOpeningCommand(buildingId, openingId) {
  return {
    label: '删除墙上开口',
    apply(state) {
      const next = updateBuilding(state, buildingId, building => ({
        ...building,
        openings: (building.openings ?? []).filter(opening => opening.id !== openingId)
      }));
      return {
        ...next,
        view: {
          ...next.view,
          selection: next.view.selection?.id === openingId
            ? { kind: 'building', id: buildingId }
            : next.view.selection
        }
      };
    }
  };
}

export function createSetTaskPhaseCommand(phase) {
  return {
    label: '切换工作阶段',
    apply(state) {
      if (phase !== 'building' && phase !== 'room' && phase !== 'sunlight') return null;
      return {
        ...state,
        view: {
          ...state.view,
          phase,
          roomEditing: phase === 'room' ? state.view.roomEditing : null,
          interiorRoomId: phase === 'sunlight' ? state.view.interiorRoomId : null
        }
      };
    }
  };
}

export function createViewRoomSunlightCommand(buildingId, roomId) {
  return {
    label: '查看房间采光',
    apply(state) {
      const room = findBuilding(state, buildingId)?.rooms?.find(item => item.id === roomId);
      if (!room) return null;
      return {
        ...state,
        simulation: { ...state.simulation, activeRoomId: roomId },
        view: {
          ...state.view,
          phase: 'sunlight', roomEditing: null, interiorRoomId: roomId,
          selection: { kind: 'room', id: roomId, buildingId }
        }
      };
    }
  };
}

export function createReturnExteriorCommand(buildingId) {
  return {
    label: '返回室外场景',
    apply(state) {
      return {
        ...state,
        view: { ...state.view, interiorRoomId: null, selection: buildingId ? { kind: 'building', id: buildingId } : null }
      };
    }
  };
}
