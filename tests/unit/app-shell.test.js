// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createSimulationController } from '../../src/features/results/createSimulationController.js';
import { createAppShell } from '../../src/features/shell/AppShell.js';
import {
  createAddBuildingCommand, createClearBuildingsCommand,
  createFinishBuildingCommand, createSetEditorModeCommand,
  createSetPhaseCommand
} from '../../src/store/buildingCommands.js';

function mount() {
  const store = createStore(createDefaultProject());
  const simulationController = createSimulationController(store);
  const shell = createAppShell({
    store, simulationController,
    onAddBuilding: () => store.execute(createAddBuildingCommand({ id: 'b1' })),
    onClearSandbox: () => store.execute(createClearBuildingsCommand()),
    confirmDeleteBuilding: () => true
  });
  document.body.append(shell);
  return { store, shell };
}
const testid = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('AppShell inspector vs results', () => {
  it('shows results panel when nothing selected, inspector when selected', () => {
    const { store, shell } = mount();
    expect(testid(shell, 'results-panel').hidden).toBe(false);
    expect(testid(shell, 'building-inspector').hidden).toBe(true);
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(testid(shell, 'building-inspector').hidden).toBe(false);
    expect(testid(shell, 'results-panel').hidden).toBe(true);
  });

  it('switches mobile panel to editor on selection and back to buildings on clear', () => {
    const { store, shell } = mount();
    expect(shell.dataset.mobilePanel).toBe('buildings');
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(shell.dataset.mobilePanel).toBe('editor');
    store.execute(createFinishBuildingCommand('b1'));
    store.execute(createSetEditorModeCommand('areas'));
    expect(shell.dataset.mobilePanel).toBe('editor');
    store.execute(createClearBuildingsCommand());
    expect(shell.dataset.mobilePanel).toBe('buildings');
  });
});

describe('AppShell mobile phase gating', () => {
  it('hides simulation/results tabs in edit phase and shows them in present', () => {
    const { store, shell } = mount();
    const nav = shell.querySelector('[data-testid="mobile-nav"]');
    const labels = [...nav.querySelectorAll('button:not([hidden])')].map(b => b.textContent);
    expect(labels).toEqual(['场景', '建筑']); // edit phase: only 场景/建筑
    store.execute(createSetPhaseCommand('present'));
    const labelsPresent = [...nav.querySelectorAll('button:not([hidden])')].map(b => b.textContent);
    expect(labelsPresent).toEqual(['场景', '建筑', '模拟', '结果']);
  });
});

describe('AppShell phase toggle', () => {
  it('hides timeline and location picker in edit phase; shows them in present', () => {
    const { store, shell } = mount();
    expect(shell.querySelector('[data-testid="timeline"]').hidden).toBe(true);
    expect(shell.querySelector('[data-testid="location-picker"]').hidden).toBe(true);
    store.execute(createSetPhaseCommand('present'));
    expect(shell.querySelector('[data-testid="timeline"]').hidden).toBe(false);
    expect(shell.querySelector('[data-testid="location-picker"]').hidden).toBe(false);
  });

  it('forces results panel over inspector in present phase even when a building is selected', () => {
    const { store, shell } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createSetPhaseCommand('present'));
    expect(shell.querySelector('[data-testid="building-inspector"]').hidden).toBe(true);
    expect(shell.querySelector('[data-testid="results-panel"]').hidden).toBe(false);
  });
});
