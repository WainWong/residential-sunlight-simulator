// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createFootprint } from '../../src/domain/buildings/createFootprint.js';
import { createStore } from '../../src/store/createStore.js';
import { createBuildingInspector } from '../../src/features/buildings/BuildingInspector.js';
import { createAddBuildingCommand } from '../../src/store/projectCommands.js';
import { createOpeningFromPreset } from '../../src/domain/openings/openingGeometry.js';
import { deriveWalls } from '../../src/domain/walls/deriveWalls.js';
import {
  createAddOpeningCommand, createAppendRoomRectCommand, createEnterRoomViewCommand, createFinishRoomCommand,
  createSelectEntityCommand, createStartRoomCommand, createUpdateOpeningCommand, createUpdateRoomCommand
} from '../../src/store/roomCommands.js';

function mount() {
  const store = createStore(createDefaultProject());
  const element = createBuildingInspector({ store, confirmDelete: () => true });
  document.body.replaceChildren(element);
  return { store, element };
}

describe('contextual building inspector', () => {
  it('shows an empty context before selection', () => {
    const { element } = mount();
    expect(element.textContent).toContain('未选择对象');
  });

  it('keeps vertical controls and removes scene-gizmo transform inputs', () => {
    const { store, element } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));

    const numberInputs = [...element.querySelectorAll('input[type="number"]')];
    expect(numberInputs).toHaveLength(2);
    expect(numberInputs.map(input => input.getAttribute('aria-label')))
      .toEqual(['楼层数', '标准层高（米）']);
    expect(element.textContent).not.toMatch(/建筑长度|建筑宽度|旋转角度|X 坐标|Y 坐标/);
    expect(element.querySelector('[data-testid="inspector-add-room-b1"]')).not.toBeNull();
  });

  it('shows a floor selector in the room view and switches the focused floor', () => {
    const { store, element } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createEnterRoomViewCommand('b1', 1));
    const selector = element.querySelector('[data-testid="floor-selector"]');
    expect(selector).not.toBeNull();
    expect(element.querySelector('[data-testid="floor-option-1"]').getAttribute('aria-pressed')).toBe('true');
    element.querySelector('[data-testid="floor-option-3"]').click();
    expect(store.getState().view.roomFocus).toEqual({ buildingId: 'b1', floor: 3 });
    expect(element.querySelector('[data-testid="floor-option-3"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('hides the floor selector outside the room view', () => {
    const { store, element } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createSelectEntityCommand({ kind: 'building', id: 'b1' }));
    expect(element.querySelector('[data-testid="floor-selector"]')).toBeNull();
  });

  it('routes from a room session to a room panel with sunlight action', () => {
    const { store, element } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    element.querySelector('[data-testid="inspector-add-room-b1"]').click();
    expect(element.querySelector('[data-testid="room-session-title"]').textContent).toBe('新建房间');
    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -3, x1: 4, z1: 3 }));
    store.execute(createFinishRoomCommand());
    expect(element.querySelector('[data-testid="view-room-sunlight"]')).not.toBeNull();
  });

  it('switches a bar building to complete finite courtyard geometry', () => {
    const { store, element } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    const template = element.querySelector('select');

    template.value = 'courtyard';
    template.dispatchEvent(new Event('change'));

    const building = store.getState().buildings[0];
    const footprint = createFootprint(building.template, building.params);
    expect(building).toMatchObject({
      template: 'courtyard',
      params: { courtyardLength: 30, courtyardDepth: 16 }
    });
    expect(footprint.holes[0].flat().every(Number.isFinite)).toBe(true);
  });

  it('refreshes opening fields after a scene gizmo changes the opening', () => {
    const { store, element } = mount();
    store.execute(createAddBuildingCommand({
      id: 'b1',
      params: { length: 10, depth: 8, floors: 1, floorHeight: 3 },
      rooms: [{
        id: 'r1', floor: 1, name: 'Living room', type: 'living', objects: [],
        rects: [{ x0: -5, z0: -4, x1: 5, z1: 4 }]
      }]
    }));
    const building = store.getState().buildings[0];
    const wall = deriveWalls(building, 1)[0];
    const opening = createOpeningFromPreset({ wall, preset: 'window', id: 'o1' });
    store.execute(createAddOpeningCommand('b1', opening));
    store.execute(createSelectEntityCommand({ kind: 'opening', id: 'o1', buildingId: 'b1' }));

    expect(element.querySelector('input[type="number"]').value).toBe('1.8');
    store.execute(createUpdateOpeningCommand('b1', 'o1', {
      bounds: { ...opening.bounds, width: 2.2 }
    }));
    expect(element.querySelector('input[type="number"]').value).toBe('2.2');
  });

  it('disposes a room editor subscription when its panel is replaced', () => {
    const { store, element } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createStartRoomCommand('b1', 1));
    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -3, x1: 4, z1: 3 }));
    store.execute(createFinishRoomCommand());
    const room = store.getState().buildings[0].rooms[0];
    const detachedEditor = element.querySelector('[data-testid="room-editor"]');
    expect(detachedEditor.textContent).toContain('1');

    store.execute(createSelectEntityCommand({ kind: 'building', id: 'b1' }));
    expect(detachedEditor.isConnected).toBe(false);
    store.execute(createUpdateRoomCommand('b1', room.id, { name: 'Renamed room' }));

    expect(detachedEditor.textContent).toContain('1');
    expect(detachedEditor.textContent).not.toContain('Renamed room');
  });
  it('opens an unresolved invalid opening from the building panel so it can be deleted', () => {
    const { store, element } = mount();
    store.execute(createAddBuildingCommand({
      id: 'b1',
      params: { length: 10, depth: 8, floors: 1, floorHeight: 3 },
      rooms: [{
        id: 'r1', floor: 1, name: 'Living room', type: 'living', objects: [],
        rects: [{ x0: -5, z0: -4, x1: 5, z1: 4 }]
      }],
      openings: [{
        id: 'o1',
        floor: 1,
        connectedRoomIds: [],
        wallAnchor: { wallId: null, centerU: 0.5 },
        preset: 'window',
        bounds: { centerU: 0.5, width: 2, bottom: 0.8, top: 2.2 },
        fill: 'glass',
        transmittance: null,
        status: 'invalid'
      }]
    }));

    const invalidOpening = element.querySelector('[data-testid="invalid-opening-o1"]');
    expect(invalidOpening).not.toBeNull();

    invalidOpening.click();

    expect(store.getState().view.selection).toEqual({
      kind: 'opening', id: 'o1', buildingId: 'b1'
    });
    expect(element.textContent).toContain('原墙面无法定位');
    element.querySelector('.button--danger').click();

    expect(store.getState().buildings[0].openings).toEqual([]);
    expect(store.getState().view.selection)
      .toEqual({ kind: 'building', id: 'b1' });
  });
});
