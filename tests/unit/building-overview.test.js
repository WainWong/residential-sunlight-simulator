// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createBuildingOverview } from '../../src/features/buildings/BuildingOverview.js';

function building(over = {}) {
  return {
    id: 'b1', name: '住宅 1', template: 'bar', rotation: 0,
    params: { length: 60, depth: 18, floors: 33, floorHeight: 3 },
    observationAreas: [{ id: 'a1' }], openings: [{ id: 'o1' }, { id: 'o2' }],
    ...over
  };
}

describe('BuildingOverview', () => {
  it('shows a read-only summary with area and opening counts', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createBuildingOverview({ store, confirmDelete: () => true });
    update(building());
    expect(element.textContent).toContain('一字型');
    expect(element.textContent).toContain('住宅 1');
    expect(element.textContent).toMatch(/观察区[^0-9]*1/);
    expect(element.textContent).toMatch(/窗[^0-9]*2/);
  });

  it('enters building editor mode on 编辑建筑', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createBuildingOverview({ store, confirmDelete: () => true });
    update(building());
    element.querySelector('[data-testid="overview-edit-building"]').click();
    expect(store.execute).toHaveBeenCalledTimes(1);
    expect(store.execute.mock.calls[0][0].label).toBe('切换编辑模式');
  });

  it('enters areas editor mode on 观察区与窗', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createBuildingOverview({ store, confirmDelete: () => true });
    update(building());
    element.querySelector('[data-testid="overview-edit-areas"]').click();
    expect(store.execute).toHaveBeenCalledTimes(1);
  });

  it('deletes only after confirm', () => {
    const store = { execute: vi.fn() };
    const confirmDelete = vi.fn(() => false);
    const { element, update } = createBuildingOverview({ store, confirmDelete });
    update(building());
    element.querySelector('[data-testid="overview-delete"]').click();
    expect(confirmDelete).toHaveBeenCalled();
    expect(store.execute).not.toHaveBeenCalled();
  });
});
