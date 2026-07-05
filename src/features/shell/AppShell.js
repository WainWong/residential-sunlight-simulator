import { createElement } from '../../ui/createElement.js';
import { createBuildingInspector } from '../buildings/BuildingInspector.js';
import { createResultsPanel } from '../results/ResultsPanel.js';
import { createTimeline } from '../timeline/Timeline.js';
import { createProjectTree } from './DesktopShell.js';
import { createMobileControls } from './MobileShell.js';

function createHeader({ onClearSandbox }) {
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
        className: 'button button--ghost',
        text: '清空沙盘',
        attributes: { type: 'button', 'data-action': 'clear-sandbox' }
      }),
      createElement('button', {
        className: 'button button--ghost button--import',
        text: '导入',
        attributes: { type: 'button', 'data-action': 'import-project' }
      }),
      createElement('button', {
        className: 'button button--ghost button--screenshot',
        text: '截图',
        attributes: { type: 'button', 'aria-label': '导出截图', 'data-action': 'export-screenshot' }
      }),
      createElement('button', {
        className: 'button button--primary',
        text: '保存项目',
        attributes: { type: 'button', 'data-action': 'save-project', 'data-primary-control': '' }
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
      { className: 'viewport__compass', attributes: { 'aria-label': '北向指南针' } },
      createElement('strong', { text: 'N' }),
      createElement('span', { text: '▲' })
    ),
    createElement('div', {
      className: 'viewport__scale',
      text: '每格 10 米',
      testId: 'grid-scale'
    }),
    createElement('div', {
      className: 'viewport__empty',
      text: '点击左侧"添加建筑"开始布置',
      testId: 'empty-sandbox-hint'
    })
  );
}

export function createAppShell({
  store,
  simulationController,
  onAddBuilding,
  onClearSandbox,
  confirmDeleteBuilding
}) {
  const { sheet, navigation } = createMobileControls();
  const projectTree = createProjectTree({ store, onAdd: onAddBuilding });
  const buildingInspector = createBuildingInspector({
    store,
    confirmDelete: confirmDeleteBuilding
  });
  const resultsPanel = createResultsPanel(simulationController);
  const inspectorHost = createElement(
    'aside',
    { className: 'inspector-host panel', testId: 'inspector' },
    buildingInspector,
    resultsPanel
  );

  function updateInspector(project) {
    const hasSelection = Boolean(project.view.selectedBuildingId);
    buildingInspector.hidden = !hasSelection;
    resultsPanel.hidden = hasSelection;
  }
  store.subscribe(updateInspector);
  updateInspector(store.getState());

  const header = createHeader({ onClearSandbox });
  header.querySelector('[data-action="clear-sandbox"]').addEventListener('click', onClearSandbox);

  return createElement(
    'div',
    { className: 'app-shell' },
    header,
    createElement(
      'div',
      { className: 'workspace' },
      projectTree,
      createViewport(),
      inspectorHost,
      sheet
    ),
    createTimeline(simulationController),
    navigation
  );
}
