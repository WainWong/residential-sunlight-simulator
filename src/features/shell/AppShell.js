import { createElement } from '../../ui/createElement.js';
import { createInspector, createProjectTree } from './DesktopShell.js';
import { createMobileControls } from './MobileShell.js';

function createHeader() {
  return createElement(
    'header',
    { className: 'app-header' },
    createElement(
      'div',
      { className: 'brand' },
      createElement('span', { className: 'brand__sun', attributes: { 'aria-hidden': 'true' } }),
      createElement(
        'div',
        {},
        createElement('p', { className: 'brand__eyebrow', text: 'RESIDENTIAL DAYLIGHT' }),
        createElement('h1', { className: 'brand__title', text: '住宅采光模拟器' })
      )
    ),
    createElement(
      'div',
      { className: 'header-actions' },
      createElement('button', {
        className: 'button button--ghost button--import',
        text: '导入',
        attributes: { type: 'button' }
      }),
      createElement('button', {
        className: 'button button--primary',
        text: '保存项目',
        attributes: { type: 'button', 'data-primary-control': '' }
      })
    )
  );
}

function createViewport() {
  return createElement(
    'main',
    { className: 'viewport' },
    createElement('canvas', {
      className: 'scene-canvas',
      attributes: { id: 'scene-canvas', 'aria-label': '三维采光场景' }
    }),
    createElement(
      'div',
      { className: 'viewport__location' },
      createElement('span', { className: 'live-dot', attributes: { 'aria-hidden': 'true' } }),
      '深圳 · 2026 冬至 · 09:30'
    ),
    createElement(
      'div',
      { className: 'viewport__empty' },
      createElement('strong', { text: '场景已准备好' }),
      createElement('span', { text: '添加建筑后即可开始模拟' })
    )
  );
}

function createTimeline() {
  return createElement(
    'section',
    { className: 'timeline' },
    createElement('button', {
      className: 'timeline__play',
      text: '▶',
      attributes: { type: 'button', 'aria-label': '播放一天', 'data-primary-control': '' }
    }),
    createElement(
      'div',
      { className: 'timeline__track-wrap' },
      createElement(
        'div',
        { className: 'timeline__labels' },
        createElement('span', { text: '06:58' }),
        createElement('strong', { text: '09:30' }),
        createElement('span', { text: '17:44' })
      ),
      createElement('div', { className: 'timeline__track' })
    )
  );
}

export function createAppShell() {
  const { sheet, navigation } = createMobileControls();
  return createElement(
    'div',
    { className: 'app-shell' },
    createHeader(),
    createElement(
      'div',
      { className: 'workspace' },
      createProjectTree(),
      createViewport(),
      createInspector(),
      sheet
    ),
    createTimeline(),
    navigation
  );
}

