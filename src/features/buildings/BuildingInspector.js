import { listBuildingTypeDefinitions } from '../../domain/buildings/buildingTypes.js';
import { selectedBuildingId as resolveSelectedBuildingId } from '../../domain/project/viewSelection.js';
import { createElement } from '../../ui/createElement.js';
import { createRemoveBuildingCommand, createUpdateBuildingCommand } from '../../store/projectCommands.js';
import { createSelectEntityCommand, createStartRoomCommand, createSetRoomFloorCommand } from '../../store/roomCommands.js';
import { createOpeningEditor } from '../openings/OpeningEditor.js';
import { createRoomEditor } from '../rooms/RoomEditor.js';

export function parseBuildingNumber(value) {
  if (String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function validateBuildingField(field, value) {
  if (value == null || !Number.isFinite(value)) return '请输入有效数字';
  if (field === 'floors' && !Number.isInteger(value)) return '楼层数必须是整数';
  if (['length', 'depth', 'floorHeight', 'floors'].includes(field) && value <= 0) {
    const label = { length: '长度', depth: '宽度', floorHeight: '层高', floors: '楼层数' }[field];
    return `${label}必须大于 0`;
  }
  return '';
}

function numberField(label, value, onChange, step = '0.1') {
  const input = createElement('input', {
    className: 'input', attributes: { type: 'number', step, value: String(value), 'aria-label': label }
  });
  input.addEventListener('change', () => {
    const parsed = Number(input.value);
    if (Number.isFinite(parsed)) onChange(parsed);
  });
  return createElement('label', { className: 'field' }, createElement('span', { className: 'field__label', text: label }), input);
}

function buildingPanel({ store, building, confirmDelete }) {
  const update = patch => store.execute(createUpdateBuildingCommand(building.id, patch));
  const name = createElement('input', { className: 'input', attributes: { value: building.name, 'aria-label': '建筑名称' } });
  name.addEventListener('change', () => update({ name: name.value.trim() || building.name }));
  const template = createElement('select', { className: 'input', attributes: { 'aria-label': '建筑类型' } });
  for (const definition of listBuildingTypeDefinitions()) {
    const option = createElement('option', { text: definition.label, attributes: { value: definition.id } });
    option.selected = definition.id === building.template;
    template.append(option);
  }
  template.addEventListener('change', () => update({ template: template.value }));
  const addRoom = createElement('button', {
    className: 'button button--primary context-primary', text: '添加房间', testId: `inspector-add-room-${building.id}`,
    attributes: { type: 'button', 'data-primary-control': '' }
  });
  addRoom.addEventListener('click', () => {
    const focus = store.getState().view.roomFocus;
    const floor = focus?.buildingId === building.id ? focus.floor : 1;
    store.execute(createStartRoomCommand(building.id, floor));
  });
  const remove = createElement('button', { className: 'button button--danger', text: '删除建筑', attributes: { type: 'button' } });
  remove.addEventListener('click', () => {
    if (confirmDelete(building)) store.execute(createRemoveBuildingCommand(building.id));
  });
  const invalidOpeningButtons = (building.openings ?? [])
    .filter(opening => opening.status === 'invalid')
    .map((opening, index) => {
      const button = createElement('button', {
        className: 'button button--secondary',
        text: `开口 ${index + 1}（需处理）`,
        testId: `invalid-opening-${opening.id}`,
        attributes: { type: 'button' }
      });
      button.addEventListener('click', () => store.execute(createSelectEntityCommand({
        kind: 'opening', id: opening.id, buildingId: building.id
      })));
      return button;
    });
  const invalidOpeningList = invalidOpeningButtons.length > 0
    ? createElement('div', { className: 'inspector-actions invalid-opening-list' },
        createElement('div', { className: 'field__error', text: '需处理的开口' }),
        ...invalidOpeningButtons)
    : null;
  return createElement('section', { className: 'building-context', testId: 'building-context' },
    createElement('div', { className: 'panel__label', text: '建筑' }),
    createElement('h2', { className: 'panel__title', text: building.name }),
    createElement('label', { className: 'field' }, createElement('span', { className: 'field__label', text: '名称' }), name),
    createElement('label', { className: 'field' }, createElement('span', { className: 'field__label', text: '类型' }), template),
    numberField('楼层数', building.params.floors, floors => update({ params: { floors: Math.max(1, Math.round(floors)) } }), '1'),
    numberField('标准层高（米）', building.params.floorHeight, floorHeight => update({ params: { floorHeight } })),
    createElement('dl', { className: 'metric-list' },
      createElement('dt', { text: '房间' }), createElement('dd', { text: `${building.rooms?.length ?? 0} 个` }),
      createElement('dt', { text: '墙上开口' }), createElement('dd', { text: `${building.openings?.length ?? 0} 个` })),
    ...(invalidOpeningList ? [invalidOpeningList] : []),
    createElement('div', { className: 'inspector-actions' }, addRoom, remove));
}

function floorSelectorBar({ store, building, floor }) {
  const floors = building.params.floors;
  const bar = createElement('div', { className: 'floor-selector', testId: 'floor-selector' },
    createElement('span', { className: 'floor-selector__label', text: '当前楼层' }));
  const buttons = createElement('div', { className: 'floor-selector__floors' });
  // Top floor first, ground floor last — reads like a building seen side-on.
  for (let f = floors; f >= 1; f -= 1) {
    const btn = createElement('button', {
      className: 'floor-selector__btn' + (f === floor ? ' is-active' : ''),
      text: `${f}`, testId: `floor-option-${f}`,
      attributes: { type: 'button', 'aria-pressed': String(f === floor), 'aria-label': `第 ${f} 层` }
    });
    if (f !== floor) btn.addEventListener('click', () => store.execute(createSetRoomFloorCommand(f)));
    buttons.append(btn);
  }
  bar.append(buttons);
  return bar;
}

export function createBuildingInspector({ store, confirmDelete = () => true }) {
  const element = createElement('aside', { className: 'inspector panel building-inspector', testId: 'building-inspector' });
  const floorBar = createElement('div', { className: 'inspector__floor-bar' });
  const contentHost = createElement('div', { className: 'inspector__content' });
  element.append(floorBar, contentHost);
  let key = null;
  let disposeContent = null;
  function replaceContent(content = null) {
    disposeContent?.();
    disposeContent = typeof content?.dispose === 'function' ? content.dispose : null;
    contentHost.replaceChildren(...(content ? [content] : []));
  }

  function renderFloorBar(project) {
    const focus = project.view.phase === 'room' ? project.view.roomFocus : null;
    const building = focus && project.buildings.find(b => b.id === focus.buildingId);
    floorBar.replaceChildren(
      ...(building && building.params.floors > 1
        ? [floorSelectorBar({ store, building, floor: focus.floor })]
        : [])
    );
  }

  function render(project) {
    renderFloorBar(project);
    const selection = project.view.selection;
    const editing = project.view.roomEditing;
    const selectedBuildingId = resolveSelectedBuildingId(project.view);
    const buildingRevision = selectedBuildingId
      ? project.buildings.find(building => building.id === selectedBuildingId)?.revision ?? 0
      : null;
    const nextKey = editing
      ? `editing:${editing.buildingId}:${editing.roomId}`
      : selection ? `${selection.kind}:${selection.buildingId ?? selection.id}:${selection.id}:${buildingRevision ?? ''}` : 'empty';
    if (nextKey === key) return;
    key = nextKey;
    if (editing) {
      replaceContent(createRoomEditor({ store, buildingId: editing.buildingId, roomId: editing.roomId }));
      return;
    }
    if (!selection) {
      replaceContent(createElement('div', { className: 'context-empty' },
        createElement('div', { className: 'panel__label', text: '当前对象' }),
        createElement('h2', { className: 'panel__title', text: '未选择对象' })));
      return;
    }
    const buildingId = resolveSelectedBuildingId(project.view);
    const building = project.buildings.find(item => item.id === buildingId);
    if (!building) { replaceContent(); return; }
    if (selection.kind === 'building') replaceContent(buildingPanel({ store, building, confirmDelete }));
    else if (selection.kind === 'room') replaceContent(createRoomEditor({ store, buildingId, roomId: selection.id }));
    else replaceContent(createOpeningEditor({ store, selection }));
  }
  store.subscribe(render);
  render(store.getState());
  return element;
}
