import {
  createSelectBuildingCommand,
  createStartAreaCreateCommand,
  createStartAreaEditCommand,
  createRemoveObservationAreaCommand,
  createEnterInteriorCommand
} from '../../store/buildingCommands.js';
import { createElement } from '../../ui/createElement.js';
import { areaLabel } from '../../domain/buildings/areaEditing.js';

export function createProjectTree({ store, onAdd }) {
  const list = createElement('div', { className: 'tree-list' });
  const add = createElement('button', {
    className: 'button button--primary',
    text: '＋ 添加建筑',
    attributes: { type: 'button', 'data-action': 'add-building', 'data-primary-control': '' }
  });
  add.addEventListener('click', onAdd);
  const addArea = createElement('button', {
    className: 'button button--secondary',
    text: '＋ 添加观察区',
    testId: 'area-create-start',
    attributes: { type: 'button' }
  });
  addArea.addEventListener('click', () => {
    const selectedId = store.getState().view.selectedBuildingId;
    if (selectedId) store.execute(createStartAreaCreateCommand(selectedId));
  });
  const actions = createElement('div', { className: 'tree-actions' }, add, addArea);

  const element = createElement(
    'aside',
    { className: 'project-tree panel', testId: 'project-tree' },
    createElement('div', { className: 'panel__label', text: '场景结构' }),
    createElement('h2', { className: 'panel__title', text: '场景对象' }),
    actions,
    list
  );

  function render(project) {
    const present = project.view.phase === 'present';
    actions.hidden = present;
    addArea.disabled = !project.view.selectedBuildingId;

    if (project.buildings.length === 0) {
      list.replaceChildren(createElement('p', {
        className: 'tree-empty',
        text: '暂无建筑。添加后可在这里选择和编辑。'
      }));
      return;
    }

    const nodes = project.buildings.map(building => {
      const selected = building.id === project.view.selectedBuildingId;
      const row = createElement('button', {
        className: `tree-row tree-row--building ${selected ? 'is-active' : ''}`,
        text: `▾ ${building.name}`,
        testId: `building-tree-${building.id}`,
        attributes: { type: 'button' }
      });
      row.addEventListener('click', () => {
        store.execute(createSelectBuildingCommand(building.id));
      });

      const children = (building.observationAreas ?? []).map((area, index) => {
        const active = project.view.areaEditing?.areaId === area.id;
        const label = createElement('button', {
          className: `tree-row__label tree-row--area ${active ? 'is-active' : ''}`,
          text: `${areaLabel(area, index)} · ${area.floor} 层`,
          testId: `area-tree-${area.id}`,
          attributes: { type: 'button' }
        });
        label.addEventListener('click', () => {
          if (present) {
            store.execute(createSelectBuildingCommand(building.id));
          } else {
            store.execute(createStartAreaEditCommand(building.id, area.id));
          }
        });
        const del = createElement('button', {
          className: 'tree-row__del', text: '✕',
          testId: `area-delete-${area.id}`,
          attributes: { type: 'button', 'aria-label': '删除观察区' }
        });
        del.disabled = present;
        del.addEventListener('click', () => {
          store.execute(createRemoveObservationAreaCommand(building.id, area.id));
        });
        const entered = project.view.interior?.areaId === area.id;
        const enter = createElement('button', {
          className: `tree-row__enter ${entered ? 'is-entered' : ''}`,
          text: entered ? '已进入' : '进入',
          testId: `area-enter-${area.id}`,
          attributes: { type: 'button' }
        });
        enter.hidden = !present;
        if (entered) enter.setAttribute('aria-pressed', 'true');
        enter.addEventListener('click', () => {
          store.execute(createEnterInteriorCommand({ buildingId: building.id, areaId: area.id }));
        });
        return createElement('div', { className: 'tree-area-row' }, label, del, enter);
      });

      return createElement('div', { className: 'tree-node' }, row, ...children);
    });

    list.replaceChildren(...nodes);
  }

  store.subscribe(render);
  render(store.getState());
  return element;
}
