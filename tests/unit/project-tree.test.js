// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createProjectTree } from '../../src/features/shell/DesktopShell.js';
import { createAddBuildingCommand, createAddObservationAreaCommand } from '../../src/store/buildingCommands.js';

function mount(state = {}) {
  const store = createStore({ ...createDefaultProject(), ...state });
  const onAdd = vi.fn();
  const tree = createProjectTree({ store, onAdd });
  document.body.append(tree);
  return { store, tree, onAdd };
}

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('createProjectTree hierarchy', () => {
  it('renders a top-level add-area button alongside add-building', () => {
    const { tree } = mount();
    expect(q(tree, 'area-create-start')).not.toBeNull();
  });

  it('renders observation areas as children', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createAddObservationAreaCommand('b1', { id: 'a1', floor: 2, rects: [] }));
    expect(q(tree, 'area-tree-a1')).not.toBeNull();
    expect(q(tree, 'area-tree-a1').textContent).toContain('观察区 1');
  });

  it('deletes an observation area from its tree row', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createAddObservationAreaCommand('b1', { id: 'a1', floor: 2, rects: [] }));
    q(tree, 'area-delete-a1').click();
    expect(store.getState().buildings[0].observationAreas).toHaveLength(0);
  });

  it('add-area button is disabled until a building is selected', () => {
    const { store, tree } = mount();
    expect(q(tree, 'area-create-start').disabled).toBe(true);
    store.execute(createAddBuildingCommand({ id: 'b1' })); // add selects the building
    expect(q(tree, 'area-create-start').disabled).toBe(false);
  });

  it('starts an area create session for the selected building from the top button', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    q(tree, 'area-create-start').click();
    expect(store.getState().view.areaEditing).toMatchObject({ mode: 'create', buildingId: 'b1' });
  });

  it('hides the add-action row in present phase', () => {
    const { store, tree } = mount({ view: { ...createDefaultProject().view, phase: 'present' } });
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(tree.querySelector('.tree-actions').hidden).toBe(true);
  });
});
