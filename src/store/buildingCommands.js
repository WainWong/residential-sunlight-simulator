import { createAreaEditingSession } from '../domain/buildings/areaEditing.js';
import { normalizeRotation } from '../domain/buildings/editorCoordinates.js';

export const BUILDING_DEFAULTS = Object.freeze({
  bar: Object.freeze({ length: 60, depth: 18 }),
  lShape: Object.freeze({ length: 60, depth: 40, wingLength: 18, wingDepth: 16 }),
  courtyard: Object.freeze({
    length: 60,
    depth: 40,
    courtyardLength: 30,
    courtyardDepth: 16
  })
});
const TEMPLATE_PARAM_FIELDS = new Set(
  Object.values(BUILDING_DEFAULTS).flatMap(defaults => Object.keys(defaults))
);

function withoutTemplateParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => !TEMPLATE_PARAM_FIELDS.has(key))
  );
}

const EDITOR_MODES = new Set(['none', 'building', 'areas']);
const PHASES = new Set(['edit', 'present']);

function nextBuildingName(buildings) {
  return `住宅 ${buildings.length + 1}`;
}

function findBuilding(state, buildingId) {
  return state.buildings.find(building => building.id === buildingId);
}

export function createAddBuildingCommand(overrides = {}) {
  return {
    label: '添加建筑',
    apply(state) {
      const id = overrides.id ?? globalThis.crypto?.randomUUID?.() ?? `building-${Date.now()}`;
      const template = overrides.template ?? 'bar';
      const building = {
        id,
        revision: 1,
        name: overrides.name ?? nextBuildingName(state.buildings),
        template,
        position: { x: 0, z: 0, ...overrides.position },
        rotation: normalizeRotation(overrides.rotation ?? 0),
        params: {
          ...BUILDING_DEFAULTS[template],
          floors: 33,
          floorHeight: 3,
          ...overrides.params
        },
        observationAreas: [],
        openings: []
      };
      return {
        ...state,
        buildings: [...state.buildings, building],
        view: {
          ...state.view,
          selectedBuildingId: id,
          editorMode: 'building',
          addingBuildingId: id
        }
      };
    }
  };
}

export function createUpdateBuildingCommand(buildingId, patch = {}) {
  return {
    label: '修改建筑',
    apply(state) {
      if (patch.template != null && !Object.hasOwn(BUILDING_DEFAULTS, patch.template)) return state;
      if (!findBuilding(state, buildingId)) return state;
      return {
        ...state,
        buildings: state.buildings.map(building => {
          if (building.id !== buildingId) return building;
          const template = patch.template ?? building.template;
          const templateChanged = template !== building.template;
          const params = templateChanged
            ? {
                ...withoutTemplateParams(building.params),
                ...BUILDING_DEFAULTS[template],
                ...patch.params
              }
            : { ...building.params, ...patch.params };
          return {
            ...building,
            revision: Number.isFinite(building.revision) ? building.revision + 1 : 1,
            name: patch.name ?? building.name,
            template,
            position: { ...building.position, ...patch.position },
            rotation: patch.rotation == null
              ? building.rotation
              : normalizeRotation(patch.rotation),
            params
          };
        })
      };
    }
  };
}

export function createSelectBuildingCommand(buildingId) {
  return {
    label: '选择建筑',
    apply(state) {
      return {
        ...state,
        view: {
          ...state.view,
          selectedBuildingId: buildingId,
          editorMode: 'none',
          // Selecting a building exits any area-editing session, so the scene
          // leaves floor-focus and returns to the normal building view.
          areaEditing: null
        }
      };
    }
  };
}

export function createSetEditorModeCommand(mode) {
  return {
    label: '切换编辑模式',
    apply(state) {
      if (!EDITOR_MODES.has(mode)) return state;
      if (mode !== 'none' && !state.view.selectedBuildingId) return state;
      return {
        ...state,
        view: { ...state.view, editorMode: mode }
      };
    }
  };
}

export function createSetPhaseCommand(phase) {
  return {
    label: '切换环节',
    apply(state) {
      if (!PHASES.has(phase)) return state;
      const view = { ...state.view, phase };
      if (phase === 'present') {
        view.areaEditing = null;
        view.editorMode = 'none';
      }
      return { ...state, view };
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

export function createFinishBuildingCommand(buildingId) {
  return {
    label: '完成建筑',
    apply(state) {
      if (state.view.editorMode !== 'building' || state.view.selectedBuildingId !== buildingId) {
        return state;
      }
      return {
        ...state,
        view: {
          ...state.view,
          editorMode: 'none',
          addingBuildingId: state.view.addingBuildingId === buildingId
            ? null
            : state.view.addingBuildingId
        }
      };
    }
  };
}

export function createCancelAddedBuildingCommand(buildingId) {
  return {
    label: '取消添加建筑',
    apply(state) {
      if (state.view.addingBuildingId !== buildingId) return state;
      return {
        ...state,
        buildings: state.buildings.filter(building => building.id !== buildingId),
        view: {
          ...state.view,
          selectedBuildingId: state.view.selectedBuildingId === buildingId
            ? null
            : state.view.selectedBuildingId,
          editorMode: state.view.selectedBuildingId === buildingId
            ? 'none'
            : state.view.editorMode,
          addingBuildingId: null
        }
      };
    }
  };
}

export function createRemoveBuildingCommand(buildingId) {
  return {
    label: '删除建筑',
    apply(state) {
      return {
        ...state,
        buildings: state.buildings.filter(building => building.id !== buildingId),
        view: {
          ...state.view,
          selectedBuildingId: state.view.selectedBuildingId === buildingId
            ? null
            : state.view.selectedBuildingId,
          editorMode: state.view.selectedBuildingId === buildingId
            ? 'none'
            : state.view.editorMode,
          addingBuildingId: state.view.addingBuildingId === buildingId
            ? null
            : state.view.addingBuildingId
        }
      };
    }
  };
}

export function createClearBuildingsCommand() {
  return {
    label: '清空沙盘',
    apply(state) {
      return {
        ...state,
        buildings: [],
        simulation: {
          ...state.simulation,
          activeAreaId: null
        },
        view: {
          ...state.view,
          selectedBuildingId: null,
          editorMode: 'none',
          addingBuildingId: null
        }
      };
    }
  };
}

export function createAddObservationAreaCommand(buildingId, area) {
  return {
    label: '添加观察区',
    apply(state) {
      return {
        ...state,
        buildings: state.buildings.map(b => b.id !== buildingId ? b : {
          ...b,
          revision: (b.revision ?? 0) + 1,
          observationAreas: [...b.observationAreas, area]
        })
      };
    }
  };
}

export function createUpdateObservationAreaCommand(buildingId, areaId, patch) {
  return {
    label: '修改观察区',
    apply(state) {
      return {
        ...state,
        buildings: state.buildings.map(b => b.id !== buildingId ? b : {
          ...b,
          revision: (b.revision ?? 0) + 1,
          observationAreas: b.observationAreas.map(a =>
            a.id !== areaId ? a : { ...a, ...patch }
          )
        })
      };
    }
  };
}

export function createRemoveObservationAreaCommand(buildingId, areaId) {
  return {
    label: '删除观察区',
    apply(state) {
      return {
        ...state,
        buildings: state.buildings.map(b => b.id !== buildingId ? b : {
          ...b,
          revision: (b.revision ?? 0) + 1,
          observationAreas: b.observationAreas.filter(a => a.id !== areaId)
        }),
        simulation: {
          ...state.simulation,
          activeAreaId: state.simulation?.activeAreaId === areaId ? null : state.simulation?.activeAreaId
        }
      };
    }
  };
}

export function createSetActiveAreaCommand(activeAreaId) {
  return {
    label: '切换观察区',
    apply(state) {
      return {
        ...state,
        simulation: { ...state.simulation, activeAreaId }
      };
    }
  };
}

export function createStartAreaCreateCommand(buildingId) {
  return {
    label: '开始新建观察区',
    apply(state) {
      return {
        ...state,
        view: {
          ...state.view,
          editorMode: 'areas',
          areaEditing: createAreaEditingSession({ mode: 'create', buildingId })
        }
      };
    }
  };
}

export function createStartAreaEditCommand(buildingId, areaId) {
  return {
    label: '开始编辑观察区',
    apply(state) {
      const building = findBuilding(state, buildingId);
      const area = (building?.observationAreas ?? []).find(a => a.id === areaId);
      if (!building || !area) return state;
      return {
        ...state,
        view: {
          ...state.view,
          editorMode: 'areas',
          areaEditing: createAreaEditingSession({ mode: 'edit', buildingId, area })
        }
      };
    }
  };
}

export function createUpdateAreaEditingCommand(patch) {
  return {
    label: '修改观察区编辑会话',
    apply(state) {
      if (!state.view.areaEditing) return state;
      return { ...state, view: { ...state.view, areaEditing: { ...state.view.areaEditing, ...patch } } };
    }
  };
}

export function createCancelAreaEditingCommand() {
  return {
    label: '取消观察区编辑',
    apply(state) {
      if (!state.view.areaEditing) return state;
      // Leaving the session returns to the building overview.
      return { ...state, view: { ...state.view, areaEditing: null, editorMode: 'none' } };
    }
  };
}

export function createSaveAreaEditingCommand() {
  return {
    label: '保存观察区',
    apply(state) {
      const editing = state.view.areaEditing;
      if (!editing || editing.rects.length === 0) return state;
      const areaId = editing.mode === 'edit'
        ? editing.areaId
        : (globalThis.crypto?.randomUUID?.() ?? `area-${Date.now()}`);
      const area = { id: areaId, floor: editing.floor, rects: editing.rects, sampleHeight: editing.sampleHeight ?? 0 };
      return {
        ...state,
        buildings: state.buildings.map(b => b.id !== editing.buildingId ? b : {
          ...b,
          revision: (b.revision ?? 0) + 1,
          observationAreas: editing.mode === 'edit'
            ? b.observationAreas.map(a => a.id !== editing.areaId ? a : { ...a, ...area })
            : [...b.observationAreas, area]
        }),
        simulation: { ...state.simulation, activeAreaId: areaId },
        // Saving returns to the building overview.
        view: { ...state.view, areaEditing: null, editorMode: 'none' }
      };
    }
  };
}

export function createAddOpeningCommand(buildingId, areaId, opening) {
  return {
    label: '添加采光口',
    apply(state) {
      return {
        ...state,
        buildings: state.buildings.map(b => b.id !== buildingId ? b : {
          ...b,
          revision: (b.revision ?? 0) + 1,
          openings: [...b.openings, opening],
          observationAreas: b.observationAreas.map(a =>
            a.id !== areaId ? a : { ...a, openingIds: [...(a.openingIds ?? []), opening.id] }
          )
        })
      };
    }
  };
}
