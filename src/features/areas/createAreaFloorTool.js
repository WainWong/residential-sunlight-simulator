import { createElement } from '../../ui/createElement.js';
import { rectArea } from '../../domain/buildings/areaEditing.js';
import {
  createCancelAreaEditingCommand,
  createSaveAreaEditingCommand,
  createUpdateAreaEditingCommand
} from '../../store/buildingCommands.js';

const TOOLS = [['draw', '画区'], ['erase', '擦除']];

export function createAreaFloorTool({ store, buildingId }) {
  let currentBuilding = null;

  const element = createElement('div', { className: 'area-floor-tool' });

  const floorInput = createElement('input', {
    className: 'input', testId: 'area-floor',
    attributes: { type: 'number', min: '1', 'aria-label': '楼层' }
  });
  floorInput.addEventListener('change', () => {
    if (!currentBuilding) return;
    const maxFloor = currentBuilding.params.floors;
    const floor = Math.max(1, Math.min(maxFloor, Math.round(Number(floorInput.value) || 1)));
    floorInput.value = String(floor);
    store.execute(createUpdateAreaEditingCommand({ floor }));
  });

  const toolButtons = new Map();
  const toolBar = createElement('div', { className: 'template-picker area-tool-buttons' });
  for (const [tool, label] of TOOLS) {
    const btn = createElement('button', {
      className: 'template-card', text: label, testId: `tool-${tool}`,
      attributes: { type: 'button', 'aria-pressed': 'false' }
    });
    btn.addEventListener('click', () => {
      // Toggle: clicking the active tool deselects it, entering view mode
      // (which unlocks camera rotation in the scene).
      const current = store.getState()?.view?.areaEditing?.tool ?? null;
      store.execute(createUpdateAreaEditingCommand({ tool: current === tool ? null : tool }));
    });
    toolButtons.set(tool, btn);
    toolBar.append(btn);
  }

  function applyToolUI(tool) {
    element.dataset.tool = tool ?? 'view';
    for (const [t, btn] of toolButtons) {
      btn.setAttribute('aria-pressed', String(t === tool));
      btn.classList.toggle('is-active', t === tool);
    }
  }

  const rectSummary = createElement('span', { className: 'area-rect-summary', testId: 'area-rect-summary' });
  const saveBtn = createElement('button', {
    className: 'button button--primary', text: '保存', testId: 'area-save',
    attributes: { type: 'button' }
  });
  saveBtn.addEventListener('click', () => store.execute(createSaveAreaEditingCommand()));
  const cancelBtn = createElement('button', {
    className: 'button button--secondary', text: '取消', testId: 'area-cancel',
    attributes: { type: 'button' }
  });
  cancelBtn.addEventListener('click', () => store.execute(createCancelAreaEditingCommand()));

  const sessionLabel = createElement('div', { className: 'panel__label', text: '新建观察区', testId: 'area-session-title' });
  const sessionTitle = createElement('h2', { className: 'panel__title', text: '建筑' });
  const floorField = createElement('label', { className: 'field' },
    createElement('span', { className: 'field__label', text: '所在楼层' }), floorInput);

  const sessionView = createElement('div', {},
    sessionLabel,
    sessionTitle,
    createElement('div', { className: 'area-session', testId: 'area-session' },
      floorField, toolBar, rectSummary),
    createElement('div', { className: 'inspector-actions' }, cancelBtn, saveBtn)
  );

  element.append(sessionView);

  function renderSession(building, session) {
    sessionLabel.textContent = session.mode === 'edit' ? '编辑观察区' : '新建观察区';
    sessionTitle.textContent = building.name ?? '建筑';
    if (document.activeElement !== floorInput) floorInput.value = String(session.floor ?? 1);
    floorInput.setAttribute('max', String(building.params.floors));
    const activeTool = session.tool ?? null;
    applyToolUI(activeTool);
    const size = rectArea(session.rects).toFixed(1);
    if (!activeTool) {
      rectSummary.textContent = '查看模式：拖拽可旋转视角，选择「画区」开始绘制';
    } else if (session.rects.length > 0) {
      rectSummary.textContent = `已绘制 ${session.rects.length} 块，共 ${size} m²`;
    } else {
      rectSummary.textContent = '在画面中拖拽画出观察区';
    }
    saveBtn.disabled = session.rects.length === 0;
    const eraseBtn = toolButtons.get('erase');
    if (eraseBtn) eraseBtn.hidden = !(session.mode === 'edit' && session.rects.length > 0);
  }

  function sync() {
    if (!currentBuilding) return;
    const state = store.getState();
    const session = state?.view?.areaEditing;
    const sessionActive = !!(session && session.buildingId === buildingId);
    sessionView.hidden = !sessionActive;
    if (sessionActive) renderSession(currentBuilding, session);
  }

  return {
    element,
    update(building) {
      currentBuilding = building;
      sync();
    }
  };
}
