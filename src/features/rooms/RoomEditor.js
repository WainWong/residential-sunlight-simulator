import { rectArea } from '../../domain/rooms/roomGeometry.js';
import { createElement } from '../../ui/createElement.js';
import {
  createCancelRoomCommand,
  createFinishRoomCommand,
  createRemoveRoomCommand,
  createStartRoomEditCommand,
  createUpdateRoomCommand,
  createViewRoomSunlightCommand
} from '../../store/roomCommands.js';

const ROOM_TYPES = [
  ['', '未指定'], ['living', '客厅'], ['bedroom', '卧室'], ['study', '书房'],
  ['kitchen', '厨房'], ['balcony', '阳台'], ['other', '其他']
];

function field(label, control) {
  return createElement('label', { className: 'field' },
    createElement('span', { className: 'field__label', text: label }), control);
}

export function createRoomEditor({ store, buildingId, roomId = null }) {
  const element = createElement('section', { className: 'room-editor', testId: 'room-editor' });

  function render(project) {
    const building = project.buildings.find(item => item.id === buildingId);
    if (!building) { element.replaceChildren(); return; }
    const editing = project.view.roomEditing?.buildingId === buildingId ? project.view.roomEditing : null;
    const activeRoomId = editing?.roomId ?? roomId ?? (project.view.selection?.kind === 'room' ? project.view.selection.id : null);
    const room = building.rooms?.find(item => item.id === activeRoomId) ?? null;

    if (editing) {
      const name = createElement('input', {
        className: 'input', attributes: { value: editing.name ?? '', placeholder: '完成后自动命名', 'aria-label': '房间名称' }
      });
      const type = createElement('select', { className: 'input', attributes: { 'aria-label': '房间类型' } });
      for (const [value, label] of ROOM_TYPES) {
        const option = createElement('option', { text: label, attributes: { value } });
        if ((editing.type ?? '') === value) option.selected = true;
        type.append(option);
      }
      const updateDraft = patch => store.setView({ roomEditing: { ...store.getState().view.roomEditing, ...patch } });
      name.addEventListener('input', () => updateDraft({ name: name.value }));
      type.addEventListener('change', () => updateDraft({ type: type.value || null }));
      const cancel = createElement('button', {
        className: 'button button--secondary', text: '取消', testId: 'room-cancel', attributes: { type: 'button' }
      });
      cancel.addEventListener('click', () => store.execute(createCancelRoomCommand()));
      const finish = createElement('button', {
        className: 'button button--primary', text: '完成房间', testId: 'room-finish', attributes: { type: 'button', 'data-primary-control': '' }
      });
      finish.disabled = editing.rects.length === 0;
      finish.addEventListener('click', () => store.execute(createFinishRoomCommand()));
      const area = rectArea(editing.rects).toFixed(1);
      element.replaceChildren(
        createElement('div', { className: 'panel__label', text: editing.mode === 'edit' ? '编辑房间' : '新建房间', testId: 'room-session-title' }),
        createElement('h2', { className: 'panel__title', text: `${building.name} · ${editing.floor} 层` }),
        createElement('div', { className: 'room-session-summary' },
          createElement('strong', { text: `${editing.rects.length} 块` }),
          createElement('span', { text: `${area} m²` })),
        field('名称', name), field('房间类型', type),
        createElement('div', { className: 'inspector-actions' }, cancel, finish)
      );
      return;
    }

    if (!room) { element.replaceChildren(); return; }
    const typeLabel = ROOM_TYPES.find(([value]) => value === (room.type ?? ''))?.[1] ?? '未指定';
    const openingCount = (building.openings ?? []).filter(opening => (opening.connectedRoomIds ?? []).includes(room.id)).length;
    const edit = createElement('button', { className: 'button button--secondary', text: '编辑房间', attributes: { type: 'button' } });
    edit.addEventListener('click', () => store.execute(createStartRoomEditCommand(buildingId, room.id)));
    const remove = createElement('button', { className: 'button button--danger', text: '删除房间', attributes: { type: 'button' } });
    remove.addEventListener('click', () => store.execute(createRemoveRoomCommand(buildingId, room.id)));
    const sunlight = createElement('button', {
      className: 'button button--primary context-primary', text: '查看采光 →',
      testId: 'view-room-sunlight', attributes: { type: 'button', 'data-primary-control': '' }
    });
    sunlight.addEventListener('click', () => store.execute(createViewRoomSunlightCommand(buildingId, room.id)));
    const rename = createElement('input', { className: 'input', attributes: { value: room.name, 'aria-label': '房间名称' } });
    rename.addEventListener('change', () => store.execute(createUpdateRoomCommand(buildingId, room.id, { name: rename.value.trim() || room.name })));
    element.replaceChildren(
      createElement('div', { className: 'panel__label', text: '房间' }),
      createElement('h2', { className: 'panel__title', text: room.name }),
      field('名称', rename),
      createElement('dl', { className: 'metric-list' },
        createElement('dt', { text: '类型' }), createElement('dd', { text: typeLabel }),
        createElement('dt', { text: '楼层' }), createElement('dd', { text: `${room.floor} 层` }),
        createElement('dt', { text: '面积' }), createElement('dd', { text: `${rectArea(room.rects).toFixed(1)} m²` }),
        createElement('dt', { text: '墙上开口' }), createElement('dd', { text: `${openingCount} 个` })),
      ...(openingCount === 0
        ? [createElement('p', { className: 'context-note', text: '当前房间还没有窗或开口' })]
        : []),
      createElement('div', { className: 'inspector-actions' }, sunlight, edit, remove)
    );
  }

  const unsubscribe = store.subscribe(render);
  element.dispose = unsubscribe;
  render(store.getState());
  return element;
}
