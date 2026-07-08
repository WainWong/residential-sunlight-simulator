// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createAreaFloorTool } from '../../src/features/areas/createAreaFloorTool.js';

function building() {
  return { id: 'b1', params: { floors: 5 }, observationAreas: [{ id: 'a1', name: '客厅', floor: 1, rects: [] }] };
}

function buildingWithNoAreas() {
  return { id: 'b1', params: { floors: 5 }, observationAreas: [] };
}

function fakeStore(state = {}) {
  const defaults = {
    view: { areaTool: 'draw', areaDraft: null },
    simulation: { activeAreaId: null },
    ...state
  };
  return { execute: vi.fn(), getState: () => defaults };
}

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('createAreaFloorTool', () => {
  it('defaults to draw tool and exposes it on dataset', () => {
    const { element, update } = createAreaFloorTool({ store: fakeStore(), buildingId: 'b1' });
    update(building());
    expect(element.dataset.tool).toBe('draw');
  });
  it('switches tool on click', () => {
    const { element, update } = createAreaFloorTool({ store: fakeStore(), buildingId: 'b1' });
    update(building());
    q(element, 'tool-draw').click();
    expect(element.dataset.tool).toBe('draw');
    q(element, 'tool-erase').click();
    expect(element.dataset.tool).toBe('erase');
  });
  it('dispatches a set-area-tool command on tool click', () => {
    const store = fakeStore();
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    q(element, 'tool-erase').click();
    const last = store.execute.mock.calls.at(-1)[0];
    expect(last.label).toBe('切换观察区工具');
  });
  it('back returns to overview', () => {
    const store = fakeStore();
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    q(element, 'inspector-back').click();
    expect(store.execute.mock.calls[0][0].label).toBe('切换编辑模式');
  });
  it('changing floor dispatches an update', () => {
    const store = fakeStore();
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    const floor = q(element, 'area-floor');
    floor.value = '3'; floor.dispatchEvent(new window.Event('change'));
    expect(store.execute).toHaveBeenCalled();
  });

  it('hides area fields and shows a hint when there are no areas', () => {
    const store = fakeStore();
    const tool = createAreaFloorTool({ store, buildingId: 'b1' });
    tool.update(buildingWithNoAreas());
    const selectField = q(tool.element, 'area-select')?.closest('.field');
    expect(selectField?.hidden).toBe(true);
    expect(tool.element.textContent).toContain('还没有观察区');
    expect(q(tool.element, 'area-empty-hint').hidden).toBe(false);
  });

  it('highlights the active tool with is-active', () => {
    const store = fakeStore();
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    // draw is default active
    expect(q(element, 'tool-draw').classList.contains('is-active')).toBe(true);
    expect(q(element, 'tool-erase').classList.contains('is-active')).toBe(false);
    // click erase
    q(element, 'tool-erase').click();
    expect(q(element, 'tool-erase').classList.contains('is-active')).toBe(true);
    expect(q(element, 'tool-draw').classList.contains('is-active')).toBe(false);
  });

  it('shows draft apply/cancel buttons and status when a draft exists', () => {
    const store = fakeStore({
      view: { areaTool: 'draw', areaDraft: { buildingId: 'b1', areaId: 'a1' } },
      simulation: { activeAreaId: 'a1' }
    });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'draft-apply').hidden).toBe(false);
    expect(q(element, 'draft-cancel').hidden).toBe(false);
    expect(q(element, 'draft-status').textContent).toContain('草稿未应用');
  });

  it('hides draft buttons and shows confirmed status when no draft exists', () => {
    const store = fakeStore();
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'draft-apply').hidden).toBe(true);
    expect(q(element, 'draft-cancel').hidden).toBe(true);
    expect(q(element, 'draft-status').textContent).toContain('已生效');
  });

  it('apply and cancel dispatch draft commands', () => {
    const store = fakeStore({
      view: { areaTool: 'draw', areaDraft: { buildingId: 'b1', areaId: 'a1' } },
      simulation: { activeAreaId: 'a1' }
    });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    q(element, 'draft-apply').click();
    expect(store.execute.mock.calls.at(-1)[0].label).toBe('应用观察区草稿');
    q(element, 'draft-cancel').click();
    expect(store.execute.mock.calls.at(-1)[0].label).toBe('放弃观察区草稿');
  });

  it('switching areas clears the draft before setting active area', () => {
    const twoAreaBuilding = {
      id: 'b1', params: { floors: 5 },
      observationAreas: [
        { id: 'a1', name: '客厅', floor: 1, rects: [] },
        { id: 'a2', name: '卧室', floor: 2, rects: [] }
      ]
    };
    const store = fakeStore();
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(twoAreaBuilding);
    const select = q(element, 'area-select');
    select.value = 'a2';
    select.dispatchEvent(new window.Event('change'));
    const labels = store.execute.mock.calls.map(c => c[0].label);
    expect(labels).toContain('放弃观察区草稿');
    expect(labels.indexOf('放弃观察区草稿')).toBeLessThan(labels.indexOf('切换观察区'));
  });

  it('hides draft bar when there are no areas', () => {
    const store = fakeStore();
    const tool = createAreaFloorTool({ store, buildingId: 'b1' });
    tool.update(buildingWithNoAreas());
    const draftBar = tool.element.querySelector('.area-draft-bar');
    expect(draftBar.hidden).toBe(true);
  });
});
