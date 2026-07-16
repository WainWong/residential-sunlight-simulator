// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createResultsPanel } from '../../src/features/results/ResultsPanel.js';

function controller(state) {
  return { getState: () => state, subscribe: () => () => {}, setActiveRoom: vi.fn() };
}

function state(overrides = {}) {
  return {
    solar: { altitudeDeg: 40, azimuthDeg: 180 }, hasDirectSun: true, litRatio: 0.5,
    totalMinutes: null, intervals: null, roomOptions: [{ id: 'r1', name: '客厅' }],
    activeRoomId: 'r1', noRoom: false, ...overrides
  };
}

describe('room direct-sun results', () => {
  it('shows calculation placeholders and direct-sun-only language', () => {
    const element = createResultsPanel(controller(state()));
    expect(element.textContent).toContain('计算中');
    expect(element.textContent).toContain('仅计算直射日光');
    expect(element.textContent).not.toContain('整体采光亮度');
  });

  it('shows an empty-room hint', () => {
    const element = createResultsPanel(controller(state({ roomOptions: [], activeRoomId: null, noRoom: true })));
    expect(element.querySelector('[data-testid="direct-sun-status"]').textContent).toBe('请选择房间');
  });

  it('switches analysis room from the selector', () => {
    const api = controller(state({
      roomOptions: [{ id: 'r1', name: '客厅' }, { id: 'r2', name: '卧室 1' }]
    }));
    const element = createResultsPanel(api);
    const select = element.querySelector('[data-testid="room-select"]');
    select.value = 'r2';
    select.dispatchEvent(new window.Event('change'));
    expect(api.setActiveRoom).toHaveBeenCalledWith('r2');
  });

  it('renders daily intervals and duration', () => {
    const element = createResultsPanel(controller(state({
      totalMinutes: 90, intervals: [{ startMinute: 540, endMinute: 630 }]
    })));
    expect(element.textContent).toContain('1 小时 30 分');
    expect(element.textContent).toContain('09:00–10:30');
  });
});
