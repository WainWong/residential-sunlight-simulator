// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createProjectTree } from '../../src/features/shell/DesktopShell.js';
import { createAddBuildingCommand } from '../../src/store/buildingCommands.js';

function mount(state = {}) {
  const store = createStore({ ...createDefaultProject(), ...state });
  const onAdd = vi.fn();
  const tree = createProjectTree({ store, onAdd });
  document.body.append(tree);
  return { store, tree, onAdd };
}

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('createProjectTree hierarchy', () => {
  it('renders buildings with a per-building add-area button', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(q(tree, 'building-tree-b1')).not.toBeNull();
    expect(q(tree, 'building-add-area-b1')).not.toBeNull();
  });

  it('renders observation areas as children', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    const state = store.getState();
    state.buildings[0].observationAreas.push({ id: 'a1', floor: 2, rects: [] });
    store.setView({}); // trigger re-render
    expect(q(tree, 'area-tree-a1')).not.toBeNull();
    expect(q(tree, 'area-tree-a1').textContent).toContain('观察区 1');
  });

  it('starts an area create session from the building add-area button', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    q(tree, 'building-add-area-b1').click();
    const last = store.getState().view.areaEditing;
    expect(last).toMatchObject({ mode: 'create', buildingId: 'b1' });
  });

  it('disables add buttons in present phase', () => {
    const { store, tree } = mount({ view: { ...createDefaultProject().view, phase: 'present' } });
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(q(tree, 'building-add-area-b1').disabled).toBe(true);
  });
});
