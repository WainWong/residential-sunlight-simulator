import { createElement } from '../../ui/createElement.js';
import { showToast } from '../../ui/Toast.js';
import {
  createEnterRoomViewCommand,
  createRemoveRoomCommand,
  createSelectEntityCommand,
  createStartRoomCommand,
  createViewRoomSunlightCommand
} from '../../store/roomCommands.js';

export function createProjectTree({ store, onAdd }) {
  const list = createElement('div', { className: 'tree-list' });
  const add = createElement('button', {
    className: 'button button--primary', text: '＋ 添加建筑',
    attributes: { type: 'button', 'data-action': 'add-building', 'data-primary-control': '' }
  });
  add.addEventListener('click', onAdd);
  const actions = createElement('div', { className: 'tree-actions' }, add);
  const element = createElement('aside', { className: 'project-tree panel', testId: 'project-tree' },
    createElement('div', { className: 'panel__label', text: '场景结构' }),
    createElement('h2', { className: 'panel__title', text: '建筑与房间' }), actions, list);

  function render(project) {
    const locked = project.view.phase === 'sunlight';
    actions.hidden = locked;
    if (project.buildings.length === 0) {
      list.replaceChildren(createElement('p', { className: 'tree-empty', text: '暂无建筑' }));
      return;
    }
    const nodes = project.buildings.map(building => {
      const selected = project.view.selection?.kind === 'building' && project.view.selection.id === building.id;
      const row = createElement('button', {
        className: `tree-row tree-row--building ${selected ? 'is-active' : ''}`,
        text: `▾ ${building.name}`, testId: `building-tree-${building.id}`, attributes: { type: 'button' }
      });
      row.addEventListener('click', () => store.execute(createSelectEntityCommand({ kind: 'building', id: building.id })));
      const addRoom = createElement('button', {
        className: 'tree-row__add', text: '+', testId: `add-room-${building.id}`,
        attributes: { type: 'button', title: '添加房间', 'aria-label': `为${building.name}添加房间` }
      });
      addRoom.hidden = locked;
      addRoom.addEventListener('click', () => {
        const view = store.getState().view;
        if (view.phase !== 'room') { store.execute(createEnterRoomViewCommand(building.id)); return; }
        const focus = view.roomFocus;
        const floor = focus?.buildingId === building.id ? focus.floor : null;
        if (floor == null) { showToast('请先在右下选择楼层,再添加房间', 'info'); return; }
        store.execute(createStartRoomCommand(building.id, floor));
      });
      const header = createElement('div', { className: 'tree-building-row' }, row, addRoom);
      const children = (building.rooms ?? []).map(room => {
        const active = project.view.selection?.kind === 'room' && project.view.selection.id === room.id;
        const label = createElement('button', {
          className: `tree-row--room ${active ? 'is-active' : ''}`,
          text: `${room.name} · ${room.floor} 层`, testId: `room-tree-${room.id}`, attributes: { type: 'button' }
        });
        label.addEventListener('click', () => {
          const command = locked
            ? createViewRoomSunlightCommand(building.id, room.id)
            : createEnterRoomViewCommand(building.id, room.floor, room.id);
          store.execute(command);
        });
        const del = createElement('button', {
          className: 'tree-row__del', text: '×', attributes: { type: 'button', 'aria-label': `删除${room.name}` }
        });
        del.hidden = locked;
        del.addEventListener('click', () => store.execute(createRemoveRoomCommand(building.id, room.id)));
        return createElement('div', { className: 'tree-room-row' }, label, del);
      });
      return createElement('div', { className: 'tree-node' }, header, ...children);
    });
    list.replaceChildren(...nodes);
  }

  store.subscribe(render);
  render(store.getState());
  return element;
}
