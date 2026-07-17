// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createStore } from '../../src/store/createStore.js';
import { createProjectTree } from '../../src/features/shell/DesktopShell.js';
import { createRoomEditor } from '../../src/features/rooms/RoomEditor.js';
import {
  createAppendRoomRectCommand,
  createFinishRoomCommand,
  createStartRoomCommand
} from '../../src/store/roomCommands.js';

function fixture() {
  const project = createDefaultProject();
  project.buildings.push({
    id: 'b1', name: '住宅 1', template: 'bar', revision: 1,
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 20, depth: 10, floors: 2, floorHeight: 3 },
    rooms: [], openings: []
  });
  return project;
}

describe('room-first components', () => {
  it('renders rooms below their building and starts a room from that building', () => {
    const store = createStore(fixture());
    const tree = createProjectTree({ store, onAdd: vi.fn() });
    document.body.append(tree);
    tree.querySelector('[data-testid="add-room-b1"]').click();
    expect(store.getState().view.roomEditing).toMatchObject({ buildingId: 'b1', floor: 1 });

    store.execute(createAppendRoomRectCommand({ x0: -4, z0: -3, x1: 4, z1: 3 }));
    store.execute(createFinishRoomCommand());
    const room = store.getState().buildings[0].rooms[0];
    expect(tree.querySelector(`[data-testid="room-tree-${room.id}"]`).textContent).toContain('房间 1');
    expect(tree.textContent).not.toContain('观察区');
  });

  it('shows the select/draw/erase toolbar with draw active for a new session', () => {
    const store = createStore(fixture());
    store.execute(createStartRoomCommand('b1', 1));
    const editor = createRoomEditor({ store, buildingId: 'b1' });
    document.body.append(editor);
    expect(editor.querySelector('[data-testid="room-session-title"]').textContent).toBe('新建房间');
    expect(editor.querySelector('[data-testid="room-tools"]')).not.toBeNull();
    expect(editor.querySelector('[data-testid="room-tool-draw"]').getAttribute('aria-pressed')).toBe('true');
    editor.querySelector('[data-testid="room-tool-erase"]').click();
    expect(store.getState().view.roomTool).toBe('erase');
    expect(editor.querySelector('[data-testid="room-tool-erase"]').getAttribute('aria-pressed')).toBe('true');
    expect(editor.querySelector('[data-testid="room-finish"]')).not.toBeNull();
  });

  it('shows view-sunlight action for a completed room', () => {
    const project = fixture();
    project.buildings[0].rooms.push({
      id: 'r1', floor: 1, name: '客厅', type: 'living', objects: [],
      rects: [{ x0: -4, z0: -3, x1: 4, z1: 3 }]
    });
    project.view.selection = { kind: 'room', id: 'r1', buildingId: 'b1' };
    const store = createStore(project);
    const editor = createRoomEditor({ store, buildingId: 'b1', roomId: 'r1' });
    expect(editor.querySelector('[data-testid="view-room-sunlight"]').textContent).toContain('查看采光');
  });
});
