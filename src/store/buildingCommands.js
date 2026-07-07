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

// Migration mirror: keep editingBuildingId derivable from editorMode so
// unmigrated consumers keep working until the mirror is removed.
function deriveEditing(view) {
  return {
    ...view,
    editingBuildingId: view.editorMode === 'building' ? view.selectedBuildingId : null
  };
}

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
        view: deriveEditing({
          ...state.view,
          selectedBuildingId: id,
          editorMode: 'building',
          addingBuildingId: id
        })
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
        view: deriveEditing({
          ...state.view,
          selectedBuildingId: buildingId,
          editorMode: 'none'
        })
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
        view: deriveEditing({ ...state.view, editorMode: mode })
      };
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
        view: deriveEditing({
          ...state.view,
          editorMode: 'none',
          addingBuildingId: state.view.addingBuildingId === buildingId
            ? null
            : state.view.addingBuildingId
        })
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
        view: deriveEditing({
          ...state.view,
          selectedBuildingId: state.view.selectedBuildingId === buildingId
            ? null
            : state.view.selectedBuildingId,
          editorMode: state.view.selectedBuildingId === buildingId
            ? 'none'
            : state.view.editorMode,
          addingBuildingId: null
        })
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
        view: deriveEditing({
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
        })
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
        view: deriveEditing({
          ...state.view,
          selectedBuildingId: null,
          editorMode: 'none',
          addingBuildingId: null
        })
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
