import { createElement } from '../../ui/createElement.js';
import { createDirectSunStatus } from './DirectSunStatus.js';

function durationLabel(totalMinutes) {
  if (totalMinutes == null) return '尚未计算';
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
  const intervalText = createElement('dd', { text: '尚未计算' });

  const areaField = createElement('label', {
    className: 'field area-select-field',
    attributes: { hidden: '' }
  });
  const areaSelect = createElement('select', {
    className: 'input',
    testId: 'area-select',
    attributes: { 'aria-label': '观察区' }
  });
  areaSelect.addEventListener('change', () => controller.setActiveArea(areaSelect.value));
  areaField.append(
    createElement('span', { className: 'field__label', text: '观察区' }),
    areaSelect
  );

  const element = createElement(
    'section',
    { className: 'results-panel', testId: 'results-panel' },
    createElement('div', { className: 'panel__label', text: '当前分析' }),
    areaField,
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
      intervalText
    ),
    createElement('p', {
      className: 'disclaimer',
      text: '结果仅供购房参考，不能替代专业日照合规报告。'
    })
  );

  function renderAreaOptions(options, activeId) {
    areaField.hidden = options.length <= 1;
    areaSelect.replaceChildren(...options.map(o => {
      const opt = createElement('option', { text: o.name, attributes: { value: o.id } });
      if (o.id === activeId) opt.setAttribute('selected', '');
      return opt;
    }));
    if (activeId != null) areaSelect.value = activeId;
  }

  function update(state) {
    renderAreaOptions(state.areaOptions ?? [], state.activeAreaId);
    if (state.noArea) {
      status.element.className = 'status-pill status-pill--neutral';
      status.element.textContent = '暂无观察区';
    } else {
      status.update(state.hasDirectSun);
    }
    duration.textContent = durationLabel(state.totalMinutes);
    intervalText.textContent = state.intervals == null ? '尚未计算' : '';
    altitude.textContent = `${state.solar.altitudeDeg.toFixed(1)}°`;
    azimuth.textContent = `${state.solar.azimuthDeg.toFixed(1)}°`;
    litRatio.textContent = state.noArea ? '—' : `${Math.round(state.litRatio * 100)}%`;
  }
  update(controller.getState());
  controller.subscribe(update);
  return element;
}
