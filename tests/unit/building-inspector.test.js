// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createBuildingInspector } from '../../src/features/buildings/BuildingInspector.js';
import {
  createAddBuildingCommand, createFinishBuildingCommand,
  createSelectBuildingCommand, createSetEditorModeCommand
} from '../../src/store/buildingCommands.js';

function mount() {
  const store = createStore(createDefaultProject());
  const el = createBuildingInspector({ store, confirmDelete: () => true });
  document.body.append(el);
  return { store, el };
}
const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);
const hasText = (el, t) => el.textContent.includes(t);

describe('BuildingInspector routing', () => {
  it('hidden when nothing selected', () => {
    const { el } = mount();
    expect(el.hidden).toBe(true);
  });

  it('add building shows the params editor, not the overview or area section', () => {
    const { store, el } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(el.hidden).toBe(false);
    expect(q(el, 'building-overview')).toBeNull();
    expect(hasText(el, '完成')).toBe(true);
  });

  // THE BUG: single building, add -> finish -> overview must expose the areas entry
  it('after add then finish, a single building shows the overview with an areas entry', () => {
    const { store, el } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createFinishBuildingCommand('b1'));
    expect(q(el, 'building-overview')).not.toBeNull();
    expect(q(el, 'overview-edit-areas')).not.toBeNull();
  });

  it('overview -> areas shows the area section and not the params form; back returns to overview', () => {
    const { store, el } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createFinishBuildingCommand('b1'));
    store.execute(createSetEditorModeCommand('areas'));
    expect(q(el, 'building-overview')).toBeNull();
    expect(hasText(el, '观察区域')).toBe(true);
    expect(q(el, 'inspector-back')).not.toBeNull();
    q(el, 'inspector-back').click();
    expect(q(el, 'building-overview')).not.toBeNull();
  });

  it('building editor and area section never appear at the same time', () => {
    const { store, el } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(hasText(el, '观察区域')).toBe(false);
    store.execute(createFinishBuildingCommand('b1'));
    store.execute(createSetEditorModeCommand('areas'));
    expect(hasText(el, '建筑长度（米）')).toBe(false);
  });
});
