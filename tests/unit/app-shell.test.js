// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createSimulationController } from '../../src/features/results/createSimulationController.js';
import { createAppShell } from '../../src/features/shell/AppShell.js';
import { createAddBuildingCommand, createClearBuildingsCommand } from '../../src/store/projectCommands.js';
import { createSetTaskPhaseCommand } from '../../src/store/roomCommands.js';

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
