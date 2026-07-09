import { createElement } from '../../ui/createElement.js';
import { rectArea } from '../../domain/buildings/areaEditing.js';
import {
  createCancelAreaEditingCommand,
  createRemoveObservationAreaCommand,
  createSaveAreaEditingCommand,
  createSetEditorModeCommand,
  createStartAreaCreateCommand,
  createStartAreaEditCommand,
  createUpdateAreaEditingCommand
} from '../../store/buildingCommands.js';

const TOOLS = [
  ['draw', '画区'],
  ['erase', '擦除']
];

export function createAreaFloorTool({ store, buildingId }) {
  let currentBuilding = null;

  const element = createElement('div', { className: 'area-floor-tool' });

  // --- Back button (shared by both views) ---
  const back = createElement('button', {
    className: 'button button--ghost', text: '‹ 返回', testId: 'inspector-back',
    attributes: { type: 'button' }
  });
  back.addEventListener('click', () => {
    const session = store.getState()?.view?.areaEditing;
    if (session && session.buildingId === buildingId) {
      store.execute(createCancelAreaEditingCommand());
    }
    store.execute(createSetEditorModeCommand('none'));
  });

  // --- Shared session inputs (reused across create/edit renders) ---
  const nameInput = createElement('input', {
    className: 'input',
    attributes: { type: 'text', 'aria-label': '区域名称', placeholder: '如：客厅、主卧' }
  });
  nameInput.addEventListener('change', () => {
    store.execute(createUpdateAreaEditingCommand({ name: nameInput.value }));
  });

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
      store.execute(createUpdateAreaEditingCommand({ tool }));
    });
    toolButtons.set(tool, btn);
    toolBar.append(btn);
  }

  function applyToolUI(tool) {
    element.dataset.tool = tool;
    for (const [t, btn] of toolButtons) {
      btn.setAttribute('aria-pressed', String(t === tool));
      btn.classList.toggle('is-active', t === tool);
    }
  }

  const rectSummary = createElement('span', {
    className: 'area-rect-summary', testId: 'area-rect-summary'
  });

  const saveBtn = createElement('button', {
    className: 'button button--primary', text: '保存', testId: 'area-save',
    attributes: { type: 'button' }
  });
  saveBtn.addEventListener('click', () => store.execute(createSaveAreaEditingCommand()));

  const cancelBtn = createElement('button', {
    className: 'button button--ghost', text: '取消', testId: 'area-cancel',
    attributes: { type: 'button' }
  });
  cancelBtn.addEventListener('click', () => store.execute(createCancelAreaEditingCommand()));

  // --- Home view scaffold (built once) ---
  const homeTitle = createElement('h2', { className: 'panel__title', text: '建筑' });
  const emptyHint = createElement('p', {
    className: 'area-empty-hint', testId: 'area-empty-hint',
    text: '还没有观察区，点击下方按钮新建一个。'
  });
  const cardsContainer = createElement('div', { className: 'area-home', testId: 'area-home' });
  const createStartBtn = createElement('button', {
    className: 'button button--secondary', text: '＋ 新建观察区', testId: 'area-create-start',
    attributes: { type: 'button' }
  });
  createStartBtn.addEventListener('click', () => {
    store.execute(createStartAreaCreateCommand(buildingId));
  });

  const homeView = createElement('div', {},
    createElement('div', { className: 'panel__label', text: '观察区' }),
    homeTitle,
    cardsContainer,
    emptyHint,
    createStartBtn
  );

  // --- Session view scaffold (built once) ---
  const sessionLabel = createElement('div', {
    className: 'panel__label', text: '新建观察区', testId: 'area-session-title'
  });
  const sessionTitle = createElement('h2', { className: 'panel__title', text: '建筑' });
  const nameField = createElement('label', { className: 'field' },
    createElement('span', { className: 'field__label', text: '区域名称' }), nameInput);
  const floorField = createElement('label', { className: 'field' },
    createElement('span', { className: 'field__label', text: '所在楼层' }), floorInput);

  const sessionView = createElement('div', {},
    sessionLabel,
    sessionTitle,
    createElement('div', { className: 'area-session', testId: 'area-session' },
      nameField,
      floorField,
      toolBar,
      rectSummary
    ),
    createElement('div', { className: 'inspector-actions' }, cancelBtn, saveBtn)
  );

  element.append(back, homeView, sessionView);

  // --- Area card creation + keyed reconciliation ---
  const cardElements = new Map(); // areaId -> card element

  function createAreaCard(area) {
    const editBtn = createElement('button', {
      className: 'button button--ghost', text: '编辑', testId: `area-edit-${area.id}`,
      attributes: { type: 'button' }
    });
    editBtn.addEventListener('click', () => {
      store.execute(createStartAreaEditCommand(buildingId, area.id));
    });

    const deleteBtn = createElement('button', {
      className: 'button button--danger', text: '删除', testId: `area-delete-${area.id}`,
      attributes: { type: 'button' }
    });
    deleteBtn.addEventListener('click', () => {
      store.execute(createRemoveObservationAreaCommand(buildingId, area.id));
    });

    const nameSpan = createElement('span', { className: 'area-card__name' });
    const metaSpan = createElement('span', { className: 'area-card__meta' });
    const card = createElement('div', {
      className: 'area-card', testId: `area-card-${area.id}`
    },
      createElement('div', { className: 'area-card__info' }, nameSpan, metaSpan),
      createElement('div', { className: 'area-card__actions' }, editBtn, deleteBtn)
    );
    card._nameSpan = nameSpan;
    card._metaSpan = metaSpan;
    updateAreaCard(card, area);
    return card;
  }

  function updateAreaCard(card, area) {
    card._nameSpan.textContent = area.name || '未命名观察区';
    const size = rectArea(area.rects).toFixed(1);
    card._metaSpan.textContent = `${area.floor} 层 · ${size} m²`;
  }

  function reconcileCards(areas) {
    const seen = new Set(areas.map(a => a.id));
    // Remove cards no longer present.
    for (const [id, card] of cardElements) {
      if (!seen.has(id)) {
        card.remove();
        cardElements.delete(id);
      }
    }
    // Create/update/reorder.
    const ordered = [];
    for (const area of areas) {
      let card = cardElements.get(area.id);
      if (!card) {
        card = createAreaCard(area);
        cardElements.set(area.id, card);
      } else {
        updateAreaCard(card, area);
      }
      ordered.push(card);
    }
    if (ordered.length) cardsContainer.append(...ordered);
  }

  function renderHome(building) {
    const areas = building.observationAreas ?? [];
    homeTitle.textContent = building.name ?? '建筑';
    reconcileCards(areas);
    emptyHint.hidden = areas.length > 0;
    cardsContainer.hidden = areas.length === 0;
  }

  function renderSession(building, session) {
    sessionLabel.textContent = session.mode === 'edit' ? '编辑观察区' : '新建观察区';
    sessionTitle.textContent = building.name ?? '建筑';

    if (document.activeElement !== nameInput) nameInput.value = session.name ?? '';
    if (document.activeElement !== floorInput) floorInput.value = String(session.floor ?? 1);
    floorInput.setAttribute('max', String(building.params.floors));
    applyToolUI(session.tool ?? 'draw');

    const size = rectArea(session.rects).toFixed(1);
    rectSummary.textContent = session.rects.length > 0
      ? `已绘制 ${session.rects.length} 块，共 ${size} m²`
      : '在画面中拖拽画出观察区';

    saveBtn.disabled = session.rects.length === 0;

    // The erase tool is only meaningful in edit mode once rects exist; in
    // create mode the draw tool is the only option.
    const eraseBtn = toolButtons.get('erase');
    if (eraseBtn) eraseBtn.hidden = !(session.mode === 'edit' && session.rects.length > 0);
  }

  function sync() {
    if (!currentBuilding) return;
    const state = store.getState();
    const session = state?.view?.areaEditing;
    const sessionActive = !!(session && session.buildingId === buildingId);
    homeView.hidden = sessionActive;
    sessionView.hidden = !sessionActive;
    if (sessionActive) {
      renderSession(currentBuilding, session);
    } else {
      renderHome(currentBuilding);
    }
  }

  return {
    element,
    update(building) {
      currentBuilding = building;
      sync();
    }
  };
}
