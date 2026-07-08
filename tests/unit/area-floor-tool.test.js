// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createAreaFloorTool } from '../../src/features/areas/createAreaFloorTool.js';

function building() {
  return {
    id: 'b1',
    name: '1号楼',
    params: { floors: 5 },
    observationAreas: [{ id: 'a1', name: '客厅', floor: 1, rects: [] }]
  };
}

function fakeStore(state = {}) {
  const defaults = {
    view: { areaTool: 'draw', areaEditing: null, areaDraft: null },
    simulation: { activeAreaId: null },
    ...state
  };
  // Allow test overrides to fully replace `view`/`simulation` if provided.
  if (state.view) defaults.view = { areaTool: 'draw', areaEditing: null, areaDraft: null, ...state.view };
  if (state.simulation) defaults.simulation = { activeAreaId: null, ...state.simulation };
  return { execute: vi.fn(), getState: () => defaults };
}

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('createAreaFloorTool', () => {
  it('shows an empty home state with no selector when there are no areas', () => {
    const store = fakeStore();
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update({ id: 'b1', name: '1号楼', params: { floors: 5 }, observationAreas: [] });
    expect(q(element, 'area-home')).not.toBeNull();
    expect(q(element, 'area-select')).toBeNull();
    expect(q(element, 'area-empty-hint').textContent).toContain('还没有观察区');
  });

  it('starts create session without adding an area', () => {
    const store = fakeStore();
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update({ id: 'b1', name: '1号楼', params: { floors: 5 }, observationAreas: [] });
    q(element, 'area-create-start').click();
    expect(store.execute.mock.calls.at(-1)[0].label).toBe('开始新建观察区');
  });

  it('lists existing areas as cards, not a dropdown', () => {
    const store = fakeStore();
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'area-select')).toBeNull();
    expect(q(element, 'area-card-a1')).not.toBeNull();
    expect(q(element, 'area-edit-a1')).not.toBeNull();
  });

  it('renders create session with disabled save until rects exist', () => {
    const store = fakeStore({
      view: { areaEditing: { mode: 'create', buildingId: 'b1', areaId: null, floor: 1, name: '', rects: [], tool: 'draw' } }
    });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'area-session-title').textContent).toContain('新建观察区');
    expect(q(element, 'area-save').disabled).toBe(true);
  });

  it('renders edit session and dispatches save/cancel/update commands', () => {
    const store = fakeStore({
      view: {
        areaEditing: {
          mode: 'edit', buildingId: 'b1', areaId: 'a1', floor: 2, name: '客厅',
          rects: [{ x0: 0, z0: 0, x1: 2, z1: 2 }], tool: 'draw'
        }
      }
    });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'area-session-title').textContent).toContain('编辑观察区');
    q(element, 'area-save').click();
    expect(store.execute.mock.calls.at(-1)[0].label).toBe('保存观察区');
    q(element, 'area-cancel').click();
    expect(store.execute.mock.calls.at(-1)[0].label).toBe('取消观察区编辑');
  });
});
