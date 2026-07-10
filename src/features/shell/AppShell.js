import { createElement } from '../../ui/createElement.js';
import { createBuildingInspector } from '../buildings/BuildingInspector.js';
import { createResultsPanel } from '../results/ResultsPanel.js';
import { createTimeline } from '../timeline/Timeline.js';
import { createLocationControl } from '../location/createLocationControl.js';
import { createProjectTree } from './DesktopShell.js';
import { createMobileControls } from './MobileShell.js';
import { createSetPhaseCommand } from '../../store/buildingCommands.js';
import { showToast } from '../../ui/Toast.js';

function createHeader({ onClearSandbox, onSetPhase, locationControl }) {
  const editBtn = createElement('button', {
    className: 'phase-toggle__btn is-active',
    text: '编辑', testId: 'phase-edit',
    attributes: { type: 'button', 'aria-pressed': 'true' }
  });
  const presentBtn = createElement('button', {
    className: 'phase-toggle__btn',
    text: '展示', testId: 'phase-present',
    attributes: { type: 'button', 'aria-pressed': 'false' }
  });
  editBtn.addEventListener('click', () => onSetPhase('edit'));
  presentBtn.addEventListener('click', () => onSetPhase('present'));
  const toggle = createElement('div', { className: 'phase-toggle', testId: 'phase-toggle' }, editBtn, presentBtn);
  return createElement(
    'header',
    { className: 'app-header' },
    createElement('div', { className: 'brand' },
      createElement('span', { className: 'brand__sun', attributes: { 'aria-hidden': 'true' } }),
      createElement('div', {},
        createElement('p', { className: 'brand__eyebrow', text: 'RESIDENTIAL DAYLIGHT' }),
        createElement('h1', { className: 'brand__title', text: '住宅采光模拟器' }))),
    toggle,
    createElement('div', { className: 'header-actions' },
      locationControl,
      createElement('button', { className: 'button button--ghost', text: '清空沙盘',
        attributes: { type: 'button', 'data-action': 'clear-sandbox' } }),
      createElement('button', { className: 'button button--ghost button--import', text: '导入',
        attributes: { type: 'button', 'data-action': 'import-project' } }),
      createElement('button', { className: 'button button--ghost button--screenshot', text: '截图',
        attributes: { type: 'button', 'aria-label': '导出截图', 'data-action': 'export-screenshot' } }),
      createElement('button', { className: 'button button--primary', text: '保存项目',
        attributes: { type: 'button', 'data-action': 'save-project', 'data-primary-control': '' } })
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
    createElement('div', { className: 'viewport__compass-wrap' },
      createElement('div',
        { className: 'viewport__compass', attributes: { 'aria-label': '北向指南针' } },
        createElement('div', { className: 'viewport__compass-needle', testId: 'compass-needle' },
          createElement('span', { className: 'viewport__compass-cardinal viewport__compass-cardinal--n', text: 'N' }),
          createElement('span', { className: 'viewport__compass-cardinal viewport__compass-cardinal--e', text: 'E' }),
          createElement('span', { className: 'viewport__compass-cardinal viewport__compass-cardinal--s', text: 'S' }),
          createElement('span', { className: 'viewport__compass-cardinal viewport__compass-cardinal--w', text: 'W' }),
          createElement('span', { className: 'viewport__compass-tip', attributes: { 'aria-hidden': 'true' } }))),
      createElement('div', { className: 'viewport__compass-readout', testId: 'compass-readout', text: '正北 0°' })
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
  const locationControl = createLocationControl({ store });
  const timeline = createTimeline(simulationController);
  const inspectorHost = createElement(
    'aside',
    { className: 'inspector-host panel', testId: 'inspector' },
    buildingInspector,
    resultsPanel
  );

  const header = createHeader({ onClearSandbox, onSetPhase: trySetPhase, locationControl: locationControl.element });
  header.querySelector('[data-action="clear-sandbox"]').addEventListener('click', onClearSandbox);

  function setPhaseUI(project) {
    const present = project.view.phase === 'present';
    timeline.hidden = !present;
    navigation.querySelector('[data-panel="simulation"]')?.toggleAttribute('hidden', !present);
    navigation.querySelector('[data-panel="results"]')?.toggleAttribute('hidden', !present);
    const editBtn = header.querySelector('[data-testid="phase-edit"]');
    const presentBtn = header.querySelector('[data-testid="phase-present"]');
    if (editBtn) {
      editBtn.classList.toggle('is-active', !present);
      editBtn.setAttribute('aria-pressed', String(!present));
    }
    if (presentBtn) {
      presentBtn.classList.toggle('is-active', present);
      presentBtn.setAttribute('aria-pressed', String(present));
    }
  }

  function trySetPhase(phase) {
    if (phase === 'present') {
      const hasArea = store.getState().buildings.some(b => (b.observationAreas ?? []).length > 0);
      if (!hasArea) {
        showToast('请先在编辑环节添加至少一个观察区。', 'error');
        return;
      }
    }
    store.execute(createSetPhaseCommand(phase));
  }

  function updateInspector(project) {
    const present = project.view.phase === 'present';
    const hasSelection = Boolean(project.view.selectedBuildingId);
    buildingInspector.hidden = present || !hasSelection;
    resultsPanel.hidden = present ? false : hasSelection;
    setPhaseUI(project);
  }
  store.subscribe(updateInspector);
  updateInspector(store.getState());

  let prevSelectedId = store.getState().view.selectedBuildingId;
  store.subscribe(project => {
    const currentSelectedId = project.view.selectedBuildingId;
    if (currentSelectedId && !prevSelectedId) {
      appShell.dataset.mobilePanel = 'editor';
    } else if (!currentSelectedId && prevSelectedId) {
      appShell.dataset.mobilePanel = 'buildings';
    }
    prevSelectedId = currentSelectedId;
  });

  const appShell = createElement(
    'div',
    { className: 'app-shell', attributes: { 'data-mobile-panel': 'buildings' } },
    header,
    createElement(
      'div',
      { className: 'workspace' },
      projectTree,
      createViewport(),
      inspectorHost,
      sheet
    ),
    timeline,
    navigation
  );
  return appShell;
}
