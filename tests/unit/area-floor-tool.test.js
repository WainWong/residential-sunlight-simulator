// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createAreaFloorTool } from '../../src/features/areas/createAreaFloorTool.js';

function building() {
  return { id: 'b1', params: { floors: 5 }, observationAreas: [{ id: 'a1', name: '客厅', floor: 1, rects: [] }] };
}
const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('createAreaFloorTool', () => {
  it('defaults to draw tool and exposes it on dataset', () => {
    const { element, update } = createAreaFloorTool({ store: { execute: vi.fn() }, buildingId: 'b1' });
    update(building());
    expect(element.dataset.tool).toBe('draw');
  });
  it('switches tool on click', () => {
    const { element, update } = createAreaFloorTool({ store: { execute: vi.fn() }, buildingId: 'b1' });
    update(building());
    q(element, 'tool-move').click();
    expect(element.dataset.tool).toBe('move');
    q(element, 'tool-erase').click();
    expect(element.dataset.tool).toBe('erase');
  });
  it('back returns to overview', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    q(element, 'inspector-back').click();
    expect(store.execute.mock.calls[0][0].label).toBe('切换编辑模式');
  });
  it('changing floor dispatches an update', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    const floor = q(element, 'area-floor');
    floor.value = '3'; floor.dispatchEvent(new window.Event('change'));
    expect(store.execute).toHaveBeenCalled();
  });
});
