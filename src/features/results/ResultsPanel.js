import { createElement } from '../../ui/createElement.js';
import { createDirectSunStatus } from './DirectSunStatus.js';

function durationLabel(totalMinutes) {
  if (totalMinutes == null) return '计算中';
  return `${Math.floor(totalMinutes / 60)} 小时 ${totalMinutes % 60} 分`;
}

function minuteToClock(minute) {
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function intervalLabel(intervals) {
  if (intervals == null) return '计算中';
  if (intervals.length === 0) return '无';
  return intervals.map(({ startMinute, endMinute }) => `${minuteToClock(startMinute)}–${minuteToClock(endMinute)}`).join('、');
}

export function createResultsPanel(controller) {
  const status = createDirectSunStatus();
  const duration = createElement('h2', { className: 'result-duration', testId: 'daily-total' });
  const altitude = createElement('dd', { testId: 'solar-altitude' });
  const azimuth = createElement('dd');
  const litRatio = createElement('dd');
  const intervals = createElement('dd');
  const roomField = createElement('label', { className: 'field room-select-field' });
  const roomSelect = createElement('select', { className: 'input', testId: 'room-select', attributes: { 'aria-label': '分析房间' } });
  roomSelect.addEventListener('change', () => controller.setActiveRoom(roomSelect.value));
  roomField.append(createElement('span', { className: 'field__label', text: '分析房间' }), roomSelect);
  const element = createElement('section', { className: 'results-panel panel', testId: 'results-panel' },
    createElement('div', { className: 'panel__label', text: '直射日光' }),
    roomField, status.element, duration,
    createElement('dl', { className: 'metric-list' },
      createElement('dt', { text: '当前直射面积比例' }), litRatio,
      createElement('dt', { text: '全天直射时段' }), intervals,
      createElement('dt', { text: '太阳高度角' }), altitude,
      createElement('dt', { text: '太阳方位角' }), azimuth),
    createElement('p', { className: 'disclaimer', text: '仅计算直射日光，不包含天空漫射、间接反射或玻璃透射损失。' }));

  function update(state) {
    const options = state.roomOptions ?? [];
    const activeId = state.activeRoomId ?? null;
    roomField.hidden = options.length === 0;
    roomSelect.replaceChildren(...options.map(option => {
      const node = createElement('option', { text: option.name, attributes: { value: option.id } });
      node.selected = option.id === activeId;
      return node;
    }));
    const noRoom = state.noRoom ?? options.length === 0;
    if (noRoom) {
      status.element.className = 'status-pill status-pill--neutral';
      status.element.textContent = '请选择房间';
    } else status.update(state.hasDirectSun);
    if (state.dailyError) {
      duration.textContent = '全天分析失败';
      intervals.textContent = state.dailyError;
    } else {
      duration.textContent = durationLabel(state.totalMinutes);
      intervals.textContent = intervalLabel(state.intervals);
    }
    altitude.textContent = `${state.solar.altitudeDeg.toFixed(1)}°`;
    azimuth.textContent = `${state.solar.azimuthDeg.toFixed(1)}°`;
    litRatio.textContent = noRoom ? '—' : `${Math.round(state.litRatio * 100)}%`;
  }
  update(controller.getState());
  controller.subscribe(update);
  return element;
}
