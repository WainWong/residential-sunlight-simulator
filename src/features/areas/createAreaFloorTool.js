import { createElement } from '../../ui/createElement.js';
import {
  createAddObservationAreaCommand,
  createSetEditorModeCommand,
  createUpdateObservationAreaCommand
} from '../../store/buildingCommands.js';

const TOOLS = [
  ['move', '移动'],
  ['draw', '画区'],
  ['erase', '擦除']
];

export function createAreaFloorTool({ store, buildingId }) {
  let currentTool = 'draw';
  let currentBuilding = null;
  let currentAreaId = null;

  const element = createElement('div', { className: 'area-floor-tool' });
  element.dataset.tool = currentTool;

  const back = createElement('button', {
    className: 'button button--ghost', text: '‹ 返回', testId: 'inspector-back',
    attributes: { type: 'button' }
  });
  back.addEventListener('click', () => store.execute(createSetEditorModeCommand('none')));

  const toolButtons = new Map();
  const toolBar = createElement('div', { className: 'template-picker area-tool-buttons' });
  for (const [tool, label] of TOOLS) {
    const btn = createElement('button', {
      className: 'template-card', text: label, testId: `tool-${tool}`,
      attributes: { type: 'button', 'aria-pressed': 'false' }
    });
    btn.addEventListener('click', () => setTool(tool));
    toolButtons.set(tool, btn);
    toolBar.append(btn);
  }

  function setTool(tool) {
    currentTool = tool;
    element.dataset.tool = tool;
    for (const [t, btn] of toolButtons) btn.setAttribute('aria-pressed', String(t === tool));
  }

  const nameInput = createElement('input', {
    className: 'input', attributes: { type: 'text', 'aria-label': '区域名称' }
  });
  nameInput.addEventListener('change', () => {
    if (!currentAreaId) return;
    store.execute(createUpdateObservationAreaCommand(
      buildingId, currentAreaId, { name: nameInput.value.trim() || '观察区域' }
    ));
  });

  const floorInput = createElement('input', {
    className: 'input', testId: 'area-floor',
    attributes: { type: 'number', min: '1', 'aria-label': '楼层' }
  });
  floorInput.addEventListener('change', () => {
    if (!currentAreaId || !currentBuilding) return;
    const maxFloor = currentBuilding.params.floors;
    const floor = Math.max(1, Math.min(maxFloor, Math.round(Number(floorInput.value) || 1)));
    store.execute(createUpdateObservationAreaCommand(buildingId, currentAreaId, { floor }));
  });

  const areaSelect = createElement('select', {
    className: 'input', testId: 'area-select', attributes: { 'aria-label': '观察区' }
  });
  areaSelect.addEventListener('change', () => {
    currentAreaId = areaSelect.value;
    store.execute({
      label: '切换观察区',
      apply: project => ({
        ...project,
        simulation: { ...project.simulation, activeAreaId: currentAreaId }
      })
    });
    syncFields();
  });

  const addAreaBtn = createElement('button', {
    className: 'button button--secondary', text: '＋新观察区', testId: 'area-add',
    attributes: { type: 'button' }
  });
  addAreaBtn.addEventListener('click', () => {
    const count = currentBuilding?.observationAreas?.length ?? 0;
    const id = globalThis.crypto?.randomUUID?.() ?? `area-${Date.now()}`;
    store.execute(createAddObservationAreaCommand(buildingId, {
      id, name: `观察区 ${count + 1}`, floor: 1, rects: [], sampleHeight: 0
    }));
  });

  function syncFields() {
    if (!currentBuilding) return;
    const areas = currentBuilding.observationAreas ?? [];
    if (!areas.some(a => a.id === currentAreaId)) currentAreaId = areas[0]?.id ?? null;
    areaSelect.replaceChildren(...areas.map(a => {
      const opt = createElement('option', { text: a.name, attributes: { value: a.id } });
      if (a.id === currentAreaId) opt.setAttribute('selected', '');
      return opt;
    }));
    if (currentAreaId != null) areaSelect.value = currentAreaId;
    const area = areas.find(a => a.id === currentAreaId);
    if (area) {
      nameInput.value = area.name;
      floorInput.value = String(area.floor);
      floorInput.setAttribute('max', String(currentBuilding.params.floors));
    }
  }

  element.append(
    back,
    createElement('div', { className: 'panel__label', text: '观察区编辑' }),
    toolBar,
    createElement('label', { className: 'field' },
      createElement('span', { className: 'field__label', text: '观察区' }), areaSelect),
    addAreaBtn,
    createElement('label', { className: 'field' },
      createElement('span', { className: 'field__label', text: '区域名称' }), nameInput),
    createElement('label', { className: 'field' },
      createElement('span', { className: 'field__label', text: '楼层' }), floorInput)
  );
  setTool(currentTool);

  return {
    element,
    update(building) {
      currentBuilding = building;
      if (currentAreaId == null) currentAreaId = building.observationAreas?.[0]?.id ?? null;
      syncFields();
    }
  };
}
