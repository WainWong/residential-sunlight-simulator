// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createProjectTree } from '../../src/features/shell/DesktopShell.js';
import { createAddBuildingCommand } from '../../src/store/projectCommands.js';
import { createAppendRoomRectCommand, createFinishRoomCommand, createSetTaskPhaseCommand } from '../../src/store/roomCommands.js';

function mount() {
  const store = createStore(createDefaultProject());
  const tree = createProjectTree({ store, onAdd: vi.fn() });
  document.body.replaceChildren(tree);
  return { store, tree };
}

describe('room-first project tree', () => {
  it('places the add-room action on each building', () => {
    const { store, tree } = mount();
    expect(tree.textContent).not.toContain('添加房间');
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(tree.querySelector('[data-testid="add-room-b1"]')).not.toBeNull();
  });

  it('renders, selects and deletes rooms as building children', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    tree.querySelector('[data-testid="add-room-b1"]').click();
    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -3, x1: 4, z1: 3 }));
    store.execute(createFinishRoomCommand());
    const room = store.getState().buildings[0].rooms[0];
    const row = tree.querySelector(`[data-testid="room-tree-${room.id}"]`);
    expect(row.textContent).toContain('房间 1');
    row.click();
    expect(store.getState().view.selection).toMatchObject({ kind: 'room', id: room.id });
    expect(store.getState().view.phase).toBe('room');
    expect(store.getState().view.roomFocus).toMatchObject({ buildingId: 'b1', floor: room.floor });
    row.parentElement.querySelector('.tree-row__del').click();
    expect(store.getState().buildings[0].rooms).toHaveLength(0);
  });

  it('locks creation and deletion in sunlight', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createSetTaskPhaseCommand('sunlight'));
    expect(tree.querySelector('.tree-actions').hidden).toBe(true);
    expect(tree.querySelector('[data-testid="add-room-b1"]').hidden).toBe(true);
  });
});
