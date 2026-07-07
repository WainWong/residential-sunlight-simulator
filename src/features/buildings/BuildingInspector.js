import { BUILDING_TEMPLATES } from '../../domain/buildings/templates.js';
import { scenePositionToEditor } from '../../domain/buildings/editorCoordinates.js';
import {
  createCancelAddedBuildingCommand,
  createFinishBuildingCommand,
  createRemoveBuildingCommand,
  createSetEditorModeCommand,
  createUpdateBuildingCommand
} from '../../store/buildingCommands.js';
import { createObservationAreaSection } from '../areas/ObservationAreaSection.js';
import { createBuildingOverview } from './BuildingOverview.js';
import { createElement } from '../../ui/createElement.js';

const TEMPLATE_DEFAULTS = {
  bar: { length: 60, depth: 18 },
  lShape: { length: 60, depth: 40, wingLength: 18, wingDepth: 16 },
  courtyard: { length: 60, depth: 40, courtyardLength: 30, courtyardDepth: 16 }
};

export function parseBuildingNumber(value) {
  if (String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function validateBuildingField(field, value) {
  if (value == null || !Number.isFinite(value)) return '请输入有效数字';
  if (field === 'floors' && !Number.isInteger(value)) return '楼层数必须是整数';
  if (['length', 'depth', 'floorHeight', 'floors'].includes(field) && value <= 0) {
    const label = { length: '长度', depth: '进深', floorHeight: '层高', floors: '楼层数' }[field];
    return `${label}必须大于 0`;
  }
  return '';
}

function numberField({ label, field, value, onValid }) {
  const input = createElement('input', {
    className: 'input',
    attributes: {
      type: 'number',
      value: String(value),
      step: field === 'floors' ? '1' : '0.1',
      'aria-label': label
    }
  });
  const error = createElement('span', {
    className: 'field__error',
    attributes: { 'aria-live': 'polite' }
  });
  input.addEventListener('input', () => {
    const parsed = parseBuildingNumber(input.value);
    const message = validateBuildingField(field, parsed);
    error.textContent = message;
    input.setAttribute('aria-invalid', String(Boolean(message)));
    if (!message) onValid(parsed);
  });
  return createElement(
    'label',
    { className: 'field' },
    createElement('span', { className: 'field__label', text: label }),
    input,
    error
  );
}

export function createBuildingInspector({ store, confirmDelete = () => true }) {
  const element = createElement('aside', {
    className: 'inspector panel building-inspector',
    testId: 'building-inspector'
  });
  const overview = createBuildingOverview({ store, confirmDelete });
  let renderKey = null;
  let areaSection = null;

  const updateBuilding = (id, patch) => store.execute(createUpdateBuildingCommand(id, patch));

  function backButton() {
    const back = createElement('button', {
      className: 'button button--ghost', text: '‹ 返回', testId: 'inspector-back',
      attributes: { type: 'button' }
    });
    back.addEventListener('click', () => store.execute(createSetEditorModeCommand('none')));
    return back;
  }

  function renderParamsEditor(project, building) {
    const editorPosition = scenePositionToEditor(building.position);
    const templateSelect = createElement('select', {
      className: 'input', attributes: { 'aria-label': '建筑类型' }
    });
    for (const [value, definition] of Object.entries(BUILDING_TEMPLATES)) {
      const option = createElement('option', { text: definition.label, attributes: { value } });
      if (value === building.template) option.setAttribute('selected', '');
      templateSelect.append(option);
    }
    templateSelect.addEventListener('change', () => {
      const defaults = TEMPLATE_DEFAULTS[templateSelect.value] ?? {};
      updateBuilding(building.id, {
        template: templateSelect.value,
        params: { ...defaults, floors: building.params.floors, floorHeight: building.params.floorHeight }
      });
      renderKey = null;
      render(store.getState());
    });

    const finish = createElement('button', {
      className: 'button button--primary', text: '完成',
      attributes: { type: 'button', 'data-primary-control': '' }
    });
    finish.addEventListener('click', () => store.execute(createFinishBuildingCommand(building.id)));

    const removeBtn = createElement('button', {
      className: 'button button--danger',
      text: project.view.addingBuildingId === building.id ? '取消本次添加' : '删除建筑',
      attributes: { type: 'button' }
    });
    removeBtn.addEventListener('click', () => {
      if (project.view.addingBuildingId === building.id) {
        store.execute(createCancelAddedBuildingCommand(building.id));
      } else if (confirmDelete(building)) {
        store.execute(createRemoveBuildingCommand(building.id));
      }
    });

    element.replaceChildren(
      backButton(),
      createElement('div', { className: 'panel__label', text: '建筑参数' }),
      createElement('h2', { className: 'panel__title', text: building.name }),
      createElement('label', { className: 'field' },
        createElement('span', { className: 'field__label', text: '建筑类型' }), templateSelect),
      createElement('div', { className: 'coordinate-fields' },
        numberField({ label: 'X 坐标（东为正）', field: 'x', value: editorPosition.x,
          onValid: x => updateBuilding(building.id, { position: { x } }) }),
        numberField({ label: 'Y 坐标（北为正）', field: 'y', value: editorPosition.y,
          onValid: y => updateBuilding(building.id, { position: { z: y } }) })),
      numberField({ label: '建筑长度（米）', field: 'length', value: building.params.length,
        onValid: length => updateBuilding(building.id, { params: { length } }) }),
      numberField({ label: '建筑进深（米）', field: 'depth', value: building.params.depth,
        onValid: depth => updateBuilding(building.id, { params: { depth } }) }),
      numberField({ label: '楼层数', field: 'floors', value: building.params.floors,
        onValid: floors => updateBuilding(building.id, { params: { floors } }) }),
      numberField({ label: '标准层高（米）', field: 'floorHeight', value: building.params.floorHeight,
        onValid: floorHeight => updateBuilding(building.id, { params: { floorHeight } }) }),
      numberField({ label: '旋转角度（顺时针）', field: 'rotation', value: building.rotation,
        onValid: rotation => updateBuilding(building.id, { rotation }) }),
      createElement('div', { className: 'inspector-actions' }, finish, removeBtn)
    );
  }

  function render(project) {
    const building = project.buildings.find(b => b.id === project.view.selectedBuildingId);
    element.hidden = !building;
    if (!building) { renderKey = null; areaSection = null; element.replaceChildren(); return; }
    const mode = project.view.editorMode;
    const key = `${building.id}:${mode}`;

    if (key === renderKey) {
      if (mode === 'areas' && areaSection) areaSection.update(building);
      else if (mode === 'none') overview.update(building);
      return;
    }
    renderKey = key;
    areaSection = null;

    if (mode === 'building') {
      renderParamsEditor(project, building);
    } else if (mode === 'areas') {
      areaSection = createObservationAreaSection({ buildingId: building.id, building, store });
      element.replaceChildren(backButton(), areaSection.element);
    } else {
      overview.update(building);
      element.replaceChildren(overview.element);
    }
  }

  store.subscribe(render);
  render(store.getState());
  return element;
}
