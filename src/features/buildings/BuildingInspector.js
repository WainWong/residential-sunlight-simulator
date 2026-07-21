import { listBuildingTypeDefinitions } from '../../domain/buildings/buildingTypes.js';
import { selectedBuildingId as resolveSelectedBuildingId } from '../../domain/project/viewSelection.js';
import { createElement } from '../../ui/createElement.js';
import { segmentedButtons } from '../../ui/segmentedButtons.js';
import { createRemoveBuildingCommand, createUpdateBuildingCommand } from '../../store/projectCommands.js';
import { createSelectEntityCommand, createStartRoomCommand, createSetRoomFloorCommand, createEnterRoomViewCommand, createSetTaskPhaseCommand } from '../../store/roomCommands.js';
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
    // 一步到位:单层楼直接开画;多层楼进"选择楼层"引导(floorPickPanel),点层即开画。
    if (building.params.floors <= 1) store.execute(createStartRoomCommand(building.id, 1));
    else store.execute(createEnterRoomViewCommand(building.id));
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

// 加房间的"选择楼层"引导:点某层立即在该层开画(一步到位)。未选层前不露出
// 任何编辑工具,只有这个选层面板。
function floorPickPanel({ store, building }) {
  const floors = building.params.floors;
  const buttons = [];
  for (let f = floors; f >= 1; f -= 1) {
    const btn = createElement('button', {
      className: 'floor-selector__btn', text: `${f}`,
      testId: `pick-floor-${f}`, attributes: { type: 'button', 'aria-label': `第 ${f} 层` }
    });
    btn.addEventListener('click', () => store.execute(createStartRoomCommand(building.id, f)));
    buttons.push(btn);
  }
  const back = createElement('button', {
    className: 'button button--secondary', text: '返回', testId: 'floor-pick-cancel', attributes: { type: 'button' }
  });
  back.addEventListener('click', () => store.execute(createSetTaskPhaseCommand('building')));
  return createElement('section', { className: 'floor-pick', testId: 'floor-pick' },
    createElement('div', { className: 'panel__label', text: '新建房间' }),
    createElement('h2', { className: 'panel__title', text: '选择楼层' }),
    createElement('p', { className: 'context-note', text: `${building.name} 共 ${floors} 层,点击要新建房间的楼层。` }),
    createElement('div', { className: 'floor-pick__floors' }, ...buttons),
    createElement('div', { className: 'inspector-actions' }, back));
}

// 该层房间列表(编辑房间视图,已选层时的右侧常驻内容)。点房间=选中它,列表下方
// 展开该房间的详情/操作(RoomEditor),选中项高亮,始终能切到本层其他房间。
function floorRoomsPanel({ store, building, floor, selectedRoomId = null }) {
  const rooms = (building.rooms ?? []).filter(r => r.floor === floor);
  const addRoom = createElement('button', {
    className: 'button button--primary context-primary', text: '＋ 新建房间',
    testId: 'floor-add-room', attributes: { type: 'button', 'data-primary-control': '' }
  });
  addRoom.addEventListener('click', () => store.execute(createStartRoomCommand(building.id, floor)));
  const rows = rooms.map(room => {
    const active = room.id === selectedRoomId;
    const btn = createElement('button', {
      className: `tree-row--room${active ? ' is-active' : ''}`, text: `${room.name}`,
      testId: `floor-room-${room.id}`, attributes: { type: 'button', 'aria-pressed': String(active) }
    });
    btn.addEventListener('click', () => store.execute(createSelectEntityCommand({ kind: 'room', id: room.id, buildingId: building.id })));
    return btn;
  });
  const section = createElement('section', { className: 'floor-rooms', testId: 'floor-rooms' },
    createElement('div', { className: 'panel__label', text: `${building.name} · ${floor} 层` }),
    createElement('h2', { className: 'panel__title', text: '本层房间' }),
    rooms.length === 0
      ? createElement('p', { className: 'context-note', text: '本层还没有房间。点"新建房间"开始画。' })
      : createElement('div', { className: 'floor-rooms__list' }, ...rows),
    createElement('div', { className: 'inspector-actions' }, addRoom));
  // 选中某房间 → 在列表下方展开它的详情面板(RoomEditor 只读态)。
  if (selectedRoomId && rooms.some(r => r.id === selectedRoomId)) {
    const editor = createRoomEditor({ store, buildingId: building.id, roomId: selectedRoomId });
    section.append(editor);
    section.dispose = editor.dispose;
  }
  return section;
}

function floorSelectorBar({ store, building, floor }) {
  const floors = building.params.floors;
  // Top floor first, ground floor last — reads like a building seen side-on.
  const options = [];
  for (let f = floors; f >= 1; f -= 1) {
    options.push({ value: f, label: `${f}`, testId: `floor-option-${f}`, ariaLabel: `第 ${f} 层` });
  }
  return createElement('div', { className: 'floor-selector', testId: 'floor-selector' },
    createElement('span', { className: 'floor-selector__label', text: '选择楼层' }),
    segmentedButtons({
      options, activeValue: floor,
      onSelect: f => store.execute(createSetRoomFloorCommand(f)),
      className: 'floor-selector__floors', btnClassName: 'floor-selector__btn'
    }));
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

  let floorBarKey = null;
  function renderFloorBar(project) {
    const focus = project.view.phase === 'room' ? project.view.roomFocus : null;
    const building = focus && project.buildings.find(b => b.id === focus.buildingId);
    // 楼层未选(选层引导态)时,右侧 floorPickPanel 已提供选层入口 —— 顶部常驻选择器
    // 此时不显示,避免"两个选择楼层"。选定层后才出现,用于切层。
    const show = building && building.params.floors > 1 && focus.floor != null;
    const nextKey = show ? `${building.id}:${focus.floor}:${building.params.floors}` : '';
    if (nextKey === floorBarKey) return;
    floorBarKey = nextKey;
    floorBar.replaceChildren(...(show ? [floorSelectorBar({ store, building, floor: focus.floor })] : []));
  }

  function render(project) {
    renderFloorBar(project);
    const view = project.view;
    const selection = view.selection;
    const editing = view.roomEditing;
    const selectedBuildingId = resolveSelectedBuildingId(view);
    const buildingRevision = selectedBuildingId
      ? project.buildings.find(building => building.id === selectedBuildingId)?.revision ?? 0
      : null;
    // 编辑房间但楼层未选(经"添加房间"进入、多层楼)→ 右侧显示"选择楼层"引导,
    // 点某层即开画。这是加房间的一步流程,底部工具在选层前不露出(由 phase+floor 门控)。
    const pickingFloor = view.phase === 'room' && view.roomFocus?.floor == null && !editing;
    // 编辑房间、已选层、未在画草稿 → 右侧始终显示"该层房间列表"(选中某房间时高亮它
    // 并在列表下方展开其操作),这样切换其他房间的入口不会消失。建筑信息只属于编辑建筑。
    const floorRooms = view.phase === 'room' && view.roomFocus?.floor != null && !editing
      && (!selection || selection.kind === 'building' || selection.kind === 'room');
    const selectedRoomId = selection?.kind === 'room' ? selection.id : null;
    const nextKey = editing
      ? `editing:${editing.buildingId}:${editing.roomId}`
      : pickingFloor ? `pickfloor:${view.roomFocus.buildingId}`
      : floorRooms ? `floorrooms:${view.roomFocus.buildingId}:${view.roomFocus.floor}:${selectedRoomId ?? ''}:${buildingRevision ?? ''}`
      : selection ? `${selection.kind}:${selection.buildingId ?? selection.id}:${selection.id}:${buildingRevision ?? ''}` : 'empty';
    if (nextKey === key) return;
    key = nextKey;
    if (editing) {
      replaceContent(createRoomEditor({ store, buildingId: editing.buildingId, roomId: editing.roomId }));
      return;
    }
    if (pickingFloor) {
      const building = project.buildings.find(item => item.id === view.roomFocus.buildingId);
      if (building) { replaceContent(floorPickPanel({ store, building })); return; }
    }
    if (floorRooms) {
      const building = project.buildings.find(item => item.id === view.roomFocus.buildingId);
      if (building) { replaceContent(floorRoomsPanel({ store, building, floor: view.roomFocus.floor, selectedRoomId })); return; }
    }
    if (!selection) {
      replaceContent(createElement('div', { className: 'context-empty' },
        createElement('div', { className: 'panel__label', text: '当前对象' }),
        createElement('h2', { className: 'panel__title', text: '未选择对象' })));
      return;
    }
    const buildingId = resolveSelectedBuildingId(view);
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
