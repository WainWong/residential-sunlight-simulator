import { createElement } from '../../ui/createElement.js';
import { createDirectSunStatus } from './DirectSunStatus.js';

function durationLabel(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} 小时 ${minutes} 分`;
}

export function createResultsPanel(controller) {
  const status = createDirectSunStatus();
  const duration = createElement('h2', {
    className: 'result-duration',
    testId: 'daily-total'
  });
  const altitude = createElement('dd', { testId: 'solar-altitude' });
  const azimuth = createElement('dd');
  const litRatio = createElement('dd');

  const element = createElement(
    'section',
    { className: 'results-panel', testId: 'results-panel' },
    createElement('div', { className: 'panel__label', text: '当前分析' }),
    status.element,
    duration,
    createElement(
      'dl',
      { className: 'metric-list' },
      createElement('dt', { text: '太阳高度角' }),
      altitude,
      createElement('dt', { text: '太阳方位角' }),
      azimuth,
      createElement('dt', { text: '照亮比例' }),
      litRatio,
      createElement('dt', { text: '直射时段' }),
      createElement('dd', { text: '09:12–14:38' })
    ),
    createElement('p', {
      className: 'disclaimer',
      text: '结果仅供购房参考，不能替代专业日照合规报告。'
    })
  );

  function update(state) {
    status.update(state.hasDirectSun);
    duration.textContent = durationLabel(state.totalMinutes);
    altitude.textContent = `${state.solar.altitudeDeg.toFixed(1)}°`;
    azimuth.textContent = `${state.solar.azimuthDeg.toFixed(1)}°`;
    litRatio.textContent = `${Math.round(state.litRatio * 100)}%`;
  }
  update(controller.getState());
  controller.subscribe(update);
  return element;
}
