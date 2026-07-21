import { createElement } from '../../ui/createElement.js';
import { segmentedButtons } from '../../ui/segmentedButtons.js';
import { createBuildingInspector } from '../buildings/BuildingInspector.js';
import { createResultsPanel } from '../results/ResultsPanel.js';
import { createTimeline } from '../timeline/Timeline.js';
import { createLocationControl } from '../location/createLocationControl.js';
import { createProjectTree } from './DesktopShell.js';
import { createMobileControls } from './MobileShell.js';
import { createSetTaskPhaseCommand, createViewRoomSunlightCommand, createEnterRoomViewCommand, createRemoveRoomCommand, createRemoveOpeningCommand } from '../../store/roomCommands.js';
import { selectedBuildingId } from '../../domain/project/viewSelection.js';

function createHeader({ store, onClearSandbox, locationControl }) {
  const build = createElement('button', {
    className: 'phase-toggle__btn is-active', text: '编辑建筑', testId: 'phase-build',
    attributes: { type: 'button', 'aria-pressed': 'true', 'data-phase': 'building' }
  });
  const room = createElement('button', {
    className: 'phase-toggle__btn', text: '编辑房间', testId: 'phase-room',
    attributes: { type: 'button', 'aria-pressed': 'false', 'data-phase': 'room' }
  });
  const sunlight = createElement('button', {
    className: 'phase-toggle__btn', text: '查看采光', testId: 'phase-sunlight',
    attributes: { type: 'button', 'aria-pressed': 'false', 'data-phase': 'sunlight' }
  });
  build.addEventListener('click', () => store.execute(createSetTaskPhaseCommand('building')));
  room.addEventListener('click', () => {
    const view = store.getState().view;
    const buildingId = selectedBuildingId(view);
    if (!buildingId) return;
    const floor = view.roomFocus?.buildingId === buildingId ? view.roomFocus.floor : 1;
    store.execute(createEnterRoomViewCommand(buildingId, floor));
  });
  sunlight.addEventListener('click', () => {
    const selection = store.getState().view.selection;
    if (selection?.kind === 'room') store.execute(createViewRoomSunlightCommand(selection.buildingId, selection.id));
    else store.execute(createSetTaskPhaseCommand('sunlight'));
  });
  const undo = createElement('button', {
    className: 'icon-button', text: '↶', testId: 'undo',
    attributes: { type: 'button', title: '撤销', 'aria-label': '撤销' }
  });
  const redo = createElement('button', {
    className: 'icon-button', text: '↷', testId: 'redo',
    attributes: { type: 'button', title: '重做', 'aria-label': '重做' }
  });
  undo.addEventListener('click', () => store.undo());
  redo.addEventListener('click', () => store.redo());
  const header = createElement('header', { className: 'app-header' },
    createElement('div', { className: 'brand' },
      createElement('span', { className: 'brand__sun', attributes: { 'aria-hidden': 'true' } }),
      createElement('div', {}, createElement('h1', { className: 'brand__title', text: '住宅采光模拟器' }))),
    createElement('div', { className: 'phase-toggle', testId: 'phase-toggle' }, build, room, sunlight),
    createElement('div', { className: 'header-actions' },
      createElement('div', { className: 'history-actions edit-only' }, undo, redo),
      locationControl,
      createElement('button', { className: 'button button--ghost button--clear edit-only', text: '清空', attributes: { type: 'button', 'data-action': 'clear-sandbox' } }),
      createElement('button', { className: 'button button--ghost button--import', text: '导入', attributes: { type: 'button', 'data-action': 'import-project' } }),
      createElement('button', { className: 'button button--ghost button--screenshot', text: '截图', attributes: { type: 'button', 'aria-label': '导出截图', 'data-action': 'export-screenshot' } }),
      createElement('button', { className: 'button button--primary', text: '保存项目', attributes: { type: 'button', 'data-action': 'save-project' } })));
  header.querySelector('[data-action="clear-sandbox"]').addEventListener('click', onClearSandbox);
  return { header, build, room, sunlight, undo, redo };
}

function createViewport(store) {
  const breadcrumb = createElement('div', { className: 'viewport__breadcrumb', testId: 'breadcrumb', text: '室外场景' });
  const returnBuild = createElement('button', {
    className: 'button button--secondary viewport__return-build', text: '返回搭建场景', testId: 'return-build', attributes: { type: 'button' }
  });
  returnBuild.addEventListener('click', () => store.execute(createSetTaskPhaseCommand('building')));
  const toggleTabletPanel = panel => {
    const shell = returnBuild.closest('.app-shell');
    if (shell) shell.dataset.tabletPanel = shell.dataset.tabletPanel === panel ? 'none' : panel;
  };
  const treeToggle = createElement('button', {
    className: 'tablet-drawer-toggle tablet-drawer-toggle--tree', text: '☰',
    attributes: { type: 'button', title: '建筑与房间', 'aria-label': '打开建筑与房间' }
  });
  treeToggle.addEventListener('click', () => toggleTabletPanel('tree'));
  const inspectorToggle = createElement('button', {
    className: 'tablet-drawer-toggle tablet-drawer-toggle--inspector', text: 'ⓘ',
    attributes: { type: 'button', title: '当前对象', 'aria-label': '打开当前对象面板' }
  });
  inspectorToggle.addEventListener('click', () => toggleTabletPanel('inspector'));
  // 天花显隐(编辑房间时):显示 / 半透明 / 隐藏。纯视觉,不影响采光。
  const ceilingControl = createElement('div', { className: 'viewport__ceiling', testId: 'ceiling-control' },
    createElement('span', { className: 'viewport__ceiling-label', text: '天花' }));
  const element = createElement('main', { className: 'viewport' },
    createElement('canvas', { className: 'scene-canvas', attributes: { id: 'scene-canvas', 'aria-label': '三维采光场景' } }),
    breadcrumb, returnBuild, treeToggle, inspectorToggle, ceilingControl,
    createElement('div', { className: 'viewport__compass-wrap' },
      createElement('div', { className: 'viewport__compass', attributes: { 'aria-label': '北向指南针' } },
        createElement('div', { className: 'viewport__compass-needle', testId: 'compass-needle' },
          createElement('span', { className: 'viewport__compass-cardinal viewport__compass-cardinal--n', text: 'N' }),
          createElement('span', { className: 'viewport__compass-cardinal viewport__compass-cardinal--e', text: 'E' }),
          createElement('span', { className: 'viewport__compass-cardinal viewport__compass-cardinal--s', text: 'S' }),
          createElement('span', { className: 'viewport__compass-cardinal viewport__compass-cardinal--w', text: 'W' }),
          createElement('span', { className: 'viewport__compass-tip', attributes: { 'aria-hidden': 'true' } }))),
      createElement('div', { className: 'viewport__compass-readout', testId: 'compass-readout', text: '正北 0°' })),
    createElement('div', { className: 'viewport__scale', text: '每格 10 米', testId: 'grid-scale' }),
    createElement('div', { className: 'viewport__empty', text: '从左侧添加建筑', testId: 'empty-sandbox-hint' }));
  return { element, breadcrumb, returnBuild, ceilingControl };
}

const CEILING_OPTIONS = [
  { value: 'show', label: '显示' },
  { value: 'ghost', label: '半透明' },
  { value: 'hide', label: '隐藏' }
];

function breadcrumbText(project) {
  const selection = project.view.selection;
  if (!selection) return '室外场景';
  const buildingId = selection.buildingId ?? (selection.kind === 'building' ? selection.id : null);
  const building = project.buildings.find(item => item.id === buildingId);
  if (!building) return '室外场景';
  if (selection.kind === 'building') return `室外场景 / ${building.name}`;
  const room = building.rooms?.find(item => item.id === (project.view.interiorRoomId ?? selection.id));
  return room ? `室外场景 / ${building.name} / ${room.name}` : `室外场景 / ${building.name}`;
}

export function createAppShell({ store, simulationController, onAddBuilding, onClearSandbox, confirmDeleteBuilding }) {
  const { sheet, navigation } = createMobileControls();
  const projectTree = createProjectTree({ store, onAdd: onAddBuilding });
  const buildingInspector = createBuildingInspector({ store, confirmDelete: confirmDeleteBuilding });
  const resultsPanel = createResultsPanel(simulationController);
  const locationControl = createLocationControl({ store });
  const timeline = createTimeline(simulationController);
  const inspectorHost = createElement('aside', { className: 'inspector-host', testId: 'inspector' }, buildingInspector, resultsPanel);
  const headerParts = createHeader({ store, onClearSandbox, locationControl: locationControl.element });
  const viewport = createViewport(store);
  const appShell = createElement('div', { className: 'app-shell', attributes: { 'data-mobile-panel': 'scene', 'data-tablet-panel': 'none', 'data-phase': 'building' } },
    headerParts.header,
    createElement('div', { className: 'workspace' }, projectTree, viewport.element, inspectorHost, sheet),
    timeline, navigation);

  let previousPhase = store.getState().view.phase;
  let previousSelection = null;
  function render(project) {
    const phase = project.view.phase;
    const sunlight = phase === 'sunlight';
    if (phase !== previousPhase) {
      appShell.dataset.mobilePanel = sunlight ? 'results' : 'scene';
      appShell.dataset.tabletPanel = sunlight ? 'inspector' : 'none';
      previousPhase = phase;
    }
    appShell.dataset.phase = phase;
    const selectionKey = project.view.selection
      ? `${project.view.selection.kind}:${project.view.selection.id}` : null;
    if (!sunlight && selectionKey && selectionKey !== previousSelection) appShell.dataset.tabletPanel = 'inspector';
    previousSelection = selectionKey;
    timeline.hidden = !sunlight;
    buildingInspector.hidden = sunlight;
    resultsPanel.hidden = !sunlight;
    viewport.returnBuild.hidden = !sunlight;
    viewport.breadcrumb.textContent = breadcrumbText(project);
    for (const [btn, active] of [
      [headerParts.build, phase === 'building'],
      [headerParts.room, phase === 'room'],
      [headerParts.sunlight, sunlight]
    ]) {
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    // 编辑房间需要一栋选中的楼作为上下文;无楼可编辑时禁用入口。
    const canEditRoom = phase === 'room' || Boolean(selectedBuildingId(project.view));
    headerParts.room.disabled = !canEditRoom;
    headerParts.undo.disabled = !store.canUndo();
    headerParts.redo.disabled = !store.canRedo();
    navigation.querySelector('[data-panel="results"]').hidden = !sunlight;
    renderCeilingControl(project, phase);
  }

  // Ceiling (天花) show/ghost/hide control — drives the shared manual view.ceiling.
  // 编辑房间: always has a focused floor (the lid target), so always shown.
  // 查看采光: only meaningful while a specific room's interior is being viewed
  // (interiorRoomId set); after returning to the exterior there is no lid target,
  // so the control is hidden rather than left inert.
  let ceilingKey = null;
  function renderCeilingControl(project, phase) {
    const show = phase === 'room'
      || (phase === 'sunlight' && project.view.interiorRoomId != null);
    const nextKey = show ? `${phase}:${project.view.ceiling}` : '';
    if (nextKey === ceilingKey) return;
    ceilingKey = nextKey;
    viewport.ceilingControl.hidden = !show;
    viewport.ceilingControl.replaceChildren(
      createElement('span', { className: 'viewport__ceiling-label', text: '天花' }),
      ...(show
        ? [segmentedButtons({
            options: CEILING_OPTIONS.map(o => ({ ...o, testId: `ceiling-${o.value}` })),
            activeValue: project.view.ceiling,
            onSelect: value => store.setView({ ceiling: value }),
            className: 'viewport__ceiling-options', btnClassName: 'viewport__ceiling-btn'
          })]
        : [])
    );
  }
  store.subscribe(render);
  render(store.getState());

  appShell.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) store.redo(); else store.undo();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Ignore while typing in a field, or mid room-draft (that has its own tools).
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const view = store.getState().view;
      if (view.roomEditing) return;
      const sel = view.selection;
      if (sel?.kind === 'room') {
        event.preventDefault();
        store.execute(createRemoveRoomCommand(sel.buildingId, sel.id));
      } else if (sel?.kind === 'opening') {
        event.preventDefault();
        store.execute(createRemoveOpeningCommand(sel.buildingId, sel.id));
      }
    }
  });
  return appShell;
}
