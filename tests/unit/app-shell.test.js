// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createSimulationController } from '../../src/features/results/createSimulationController.js';
import { createAppShell } from '../../src/features/shell/AppShell.js';
import {
  createAddBuildingCommand, createClearBuildingsCommand,
  createFinishBuildingCommand, createSetEditorModeCommand
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
