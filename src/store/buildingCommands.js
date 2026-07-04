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
          editingBuildingId: id,
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
      if (!findBuilding(state, buildingId)) return state;
      return {
        ...state,
        buildings: state.buildings.map(building => {
          if (building.id !== buildingId) return building;
          const template = patch.template ?? building.template;
          const templateChanged = template !== building.template;
          const params = templateChanged
            ? {
                ...BUILDING_DEFAULTS[template],
                floors: building.params.floors,
                floorHeight: building.params.floorHeight,
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

export function createSelectBuildingCommand(buildingId, { editing = false } = {}) {
  return {
    label: '选择建筑',
    apply(state) {
      return {
        ...state,
        view: {
          ...state.view,
          selectedBuildingId: buildingId,
          editingBuildingId: editing ? buildingId : state.view.editingBuildingId
        }
      };
    }
  };
}

export function createFinishBuildingCommand(buildingId) {
  return {
    label: '完成建筑',
    apply(state) {
      return {
        ...state,
        view: {
          ...state.view,
          selectedBuildingId: buildingId,
          editingBuildingId: state.view.editingBuildingId === buildingId
            ? null
            : state.view.editingBuildingId,
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
          editingBuildingId: state.view.editingBuildingId === buildingId
            ? null
            : state.view.editingBuildingId,
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
          editingBuildingId: state.view.editingBuildingId === buildingId
            ? null
            : state.view.editingBuildingId,
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
          editingBuildingId: null,
          addingBuildingId: null
        }
      };
    }
  };
}
