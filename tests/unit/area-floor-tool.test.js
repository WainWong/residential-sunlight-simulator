// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createAreaFloorTool } from '../../src/features/areas/createAreaFloorTool.js';

function building() {
  return {
    id: 'b1', name: '1号楼', params: { floors: 5 },
    observationAreas: [{ id: 'a1', floor: 1, rects: [] }]
  };
}

function fakeStore(state = {}) {
  const defaults = { view: { areaEditing: null }, ...state };
  if (state.view) defaults.view = { areaEditing: null, ...state.view };
  return { execute: vi.fn(), getState: () => defaults };
}

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

function session(over = {}) {
  return { mode: 'create', buildingId: 'b1', areaId: null, floor: 1, rects: [], tool: 'draw', ...over };
}

describe('createAreaFloorTool (session-only)', () => {
  it('has no home view, name input, or create-start button', () => {
    const store = fakeStore({ view: { areaEditing: session() } });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'area-home')).toBeNull();
    expect(q(element, 'area-create-start')).toBeNull();
    expect(q(element, 'area-session')).not.toBeNull();
    expect(element.querySelector('input[aria-label="区域名称"]')).toBeNull();
  });

  it('renders create session with disabled save until rects exist', () => {
    const store = fakeStore({ view: { areaEditing: session() } });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'area-session-title').textContent).toContain('新建观察区');
    expect(q(element, 'area-save').disabled).toBe(true);
  });

  it('dispatches save and cancel commands in an edit session', () => {
    const store = fakeStore({
      view: { areaEditing: session({ mode: 'edit', areaId: 'a1', floor: 2, rects: [{ x0: 0, z0: 0, x1: 2, z1: 2 }] }) }
    });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'area-session-title').textContent).toContain('编辑观察区');
    q(element, 'area-save').click();
    expect(store.execute.mock.calls.at(-1)[0].label).toBe('保存观察区');
    q(element, 'area-cancel').click();
    expect(store.execute.mock.calls.at(-1)[0].label).toBe('取消观察区编辑');
  });

  it('hides erase in create mode, shows it for non-empty edit sessions', () => {
    const createStore = fakeStore({ view: { areaEditing: session() } });
    const createTool = createAreaFloorTool({ store: createStore, buildingId: 'b1' });
    createTool.update(building());
    expect(q(createTool.element, 'tool-erase').hidden).toBe(true);

    const editStore = fakeStore({
      view: { areaEditing: session({ mode: 'edit', areaId: 'a1', floor: 2, rects: [{ x0: 0, z0: 0, x1: 2, z1: 2 }] }) }
    });
    const editTool = createAreaFloorTool({ store: editStore, buildingId: 'b1' });
    editTool.update(building());
    expect(q(editTool.element, 'tool-erase').hidden).toBe(false);
  });

  it('has no back button (selecting a building or cancel/save leaves the session)', () => {
    const store = fakeStore({ view: { areaEditing: session() } });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'inspector-back')).toBeNull();
  });
});
