// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createResultsPanel } from '../../src/features/results/ResultsPanel.js';

function fakeController(state) {
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe: l => { listeners.add(l); return () => listeners.delete(l); },
    setActiveArea: vi.fn(),
    _emit(next) { state = next; for (const l of listeners) l(next); }
  };
}
const solar = { altitudeDeg: 40, azimuthDeg: 180 };

describe('ResultsPanel', () => {
  it('shows placeholder for daily totals instead of hardcoded interval', () => {
    const el = createResultsPanel(fakeController({
      noArea: false, hasDirectSun: true, litRatio: 0.5, solar,
      totalMinutes: null, intervals: null, areaOptions: [{ id: 'a', name: '客厅' }], activeAreaId: 'a'
    }));
    expect(el.textContent).toContain('尚未计算');
    expect(el.textContent).not.toContain('09:12');
  });

  it('shows an empty-area hint when noArea', () => {
    const el = createResultsPanel(fakeController({
      noArea: true, hasDirectSun: false, litRatio: 0, solar,
      totalMinutes: null, intervals: null, areaOptions: [], activeAreaId: null
    }));
    expect(el.querySelector('[data-testid="direct-sun-status"]').textContent).toContain('暂无观察区');
  });

  it('renders a selector when more than one area and dispatches on change', () => {
    const controller = fakeController({
      noArea: false, hasDirectSun: true, litRatio: 1, solar,
      totalMinutes: null, intervals: null,
      areaOptions: [{ id: 'a', name: '客厅' }, { id: 'b', name: '卧室' }], activeAreaId: 'a'
    });
    const el = createResultsPanel(controller);
    const select = el.querySelector('[data-testid="area-select"]');
    expect(select).not.toBeNull();
    select.value = 'b';
    select.dispatchEvent(new window.Event('change'));
    expect(controller.setActiveArea).toHaveBeenCalledWith('b');
  });
});
