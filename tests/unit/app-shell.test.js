// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createSimulationController } from '../../src/features/results/createSimulationController.js';
import { createAppShell } from '../../src/features/shell/AppShell.js';
import { createAddBuildingCommand, createClearBuildingsCommand } from '../../src/store/projectCommands.js';
import { createSetTaskPhaseCommand, createAppendRoomRectCommand, createFinishRoomCommand, createSelectEntityCommand, createStartRoomCommand, createEnterRoomViewCommand, createViewRoomSunlightCommand, createReturnExteriorCommand } from '../../src/store/roomCommands.js';

function mount() {
  const store = createStore(createDefaultProject());
  const simulationController = createSimulationController(store);
  const shell = createAppShell({
    store, simulationController,
    onAddBuilding: () => store.execute(createAddBuildingCommand({ id: 'b1' })),
    onClearSandbox: () => store.execute(createClearBuildingsCommand()),
    confirmDeleteBuilding: () => true
  });
  document.body.replaceChildren(shell);
  return { store, shell };
}

describe('room-first AppShell', () => {
  it('shows the ceiling control in the room view and toggles view.ceiling', () => {
    const { store, shell } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    const control = shell.querySelector('[data-testid="ceiling-control"]');
    expect(control.hidden).toBe(true); // building phase
    store.execute(createEnterRoomViewCommand('b1', 1));
    expect(control.hidden).toBe(false);
    // default hidden ceiling
    expect(shell.querySelector('[data-testid="ceiling-hide"]').getAttribute('aria-pressed')).toBe('true');
    shell.querySelector('[data-testid="ceiling-ghost"]').click();
    expect(store.getState().view.ceiling).toBe('ghost');
    expect(shell.querySelector('[data-testid="ceiling-ghost"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the ceiling control in sunlight only while a specific room is viewed', () => {
    const { store, shell } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createStartRoomCommand('b1', 1));
    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -3, x1: 4, z1: 3 }));
    store.execute(createFinishRoomCommand());
    const roomId = store.getState().buildings[0].rooms[0].id;
    const control = shell.querySelector('[data-testid="ceiling-control"]');
    store.execute(createViewRoomSunlightCommand('b1', roomId));
    expect(control.hidden).toBe(false); // viewing a room's interior
    store.execute(createReturnExteriorCommand('b1'));
    expect(control.hidden).toBe(true); // back to exterior (still sunlight) → no lid target
  });

  it('uses the inspector in build and results only in sunlight', () => {
    const { store, shell } = mount();
    expect(shell.querySelector('[data-testid="building-inspector"]').hidden).toBe(false);
    expect(shell.querySelector('[data-testid="results-panel"]').hidden).toBe(true);
    store.execute(createSetTaskPhaseCommand('sunlight'));
    expect(shell.querySelector('[data-testid="building-inspector"]').hidden).toBe(true);
    expect(shell.querySelector('[data-testid="results-panel"]').hidden).toBe(false);
    expect(shell.querySelector('[data-testid="timeline"]').hidden).toBe(false);
    expect(shell.querySelector('[data-testid="return-build"]').hidden).toBe(false);
  });

  it('exposes the three view phases and no old product terms', () => {
    const { shell } = mount();
    expect(shell.querySelector('[data-testid="phase-build"]').textContent).toBe('编辑建筑');
    expect(shell.querySelector('[data-testid="phase-room"]').textContent).toBe('编辑房间');
    expect(shell.querySelector('[data-testid="phase-sunlight"]').textContent).toBe('查看采光');
    expect(shell.textContent).not.toMatch(/观察区|画区|进入观察区/);
  });

  it('updates undo and redo controls from command history', () => {
    const { store, shell } = mount();
    const undo = shell.querySelector('[data-testid="undo"]');
    const redo = shell.querySelector('[data-testid="redo"]');
    expect(undo.disabled).toBe(true);
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(redo.disabled).toBe(false);
  });

  it('deletes the selected room with the Delete key', () => {
    const { store, shell } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createStartRoomCommand('b1', 1));
    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -3, x1: 4, z1: 3 }));
    store.execute(createFinishRoomCommand());
    const roomId = store.getState().buildings[0].rooms[0].id;
    store.execute(createSelectEntityCommand({ kind: 'room', id: roomId, buildingId: 'b1' }));
    shell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(store.getState().buildings[0].rooms).toEqual([]);
  });

  it('does not delete while typing in a field', () => {
    const { store, shell } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createStartRoomCommand('b1', 1));
    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -3, x1: 4, z1: 3 }));
    store.execute(createFinishRoomCommand());
    const roomId = store.getState().buildings[0].rooms[0].id;
    store.execute(createSelectEntityCommand({ kind: 'room', id: roomId, buildingId: 'b1' }));
    const input = document.createElement('input');
    shell.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(store.getState().buildings[0].rooms).toHaveLength(1);
  });

  it('keeps mobile navigation browse-only and reveals results in sunlight', () => {
    const { store, shell } = mount();
    const nav = shell.querySelector('[data-testid="mobile-nav"]');
    expect([...nav.querySelectorAll('button:not([hidden])')].map(button => button.textContent)).toEqual(['场景', '房间']);
    store.execute(createSetTaskPhaseCommand('sunlight'));
    expect([...nav.querySelectorAll('button:not([hidden])')].map(button => button.textContent)).toEqual(['场景', '房间', '结果']);
  });

  it('keeps location control available in both phases', () => {
    const { store, shell } = mount();
    const button = shell.querySelector('[data-testid="location-button"]');
    const popover = shell.querySelector('[data-testid="location-popover"]');
    button.click();
    expect(popover.hidden).toBe(false);
    store.execute(createSetTaskPhaseCommand('sunlight'));
    expect(button).not.toBeNull();
  });
});
