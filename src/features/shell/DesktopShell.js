import {
  createSelectBuildingCommand,
  createStartAreaCreateCommand,
  createStartAreaEditCommand
} from '../../store/buildingCommands.js';
import { createElement } from '../../ui/createElement.js';
import { areaLabel } from '../../domain/buildings/areaEditing.js';

export function createProjectTree({ store, onAdd }) {
  const list = createElement('div', { className: 'tree-list' });
  const add = createElement('button', {
    className: 'button button--primary panel__action',
    text: '＋ 添加建筑',
    attributes: { type: 'button', 'data-action': 'add-building', 'data-primary-control': '' }
  });
  add.addEventListener('click', onAdd);

  const element = createElement(
    'aside',
    { className: 'project-tree panel', testId: 'project-tree' },
    createElement('div', { className: 'panel__label', text: '场景结构' }),
    createElement('h2', { className: 'panel__title', text: '场景对象' }),
    add,
    list
  );

  function render(project) {
    const locked = project.view.phase === 'present';
    add.disabled = locked;

    if (project.buildings.length === 0) {
      list.replaceChildren(createElement('p', {
        className: 'tree-empty',
        text: '暂无建筑。添加后可在这里选择和编辑。'
      }));
      return;
    }

    const nodes = project.buildings.map(building => {
      const selected = building.id === project.view.selectedBuildingId;
      const addAreaBtn = createElement('button', {
        className: 'button button--ghost tree-row__add',
        text: '＋ 观察区',
        testId: `building-add-area-${building.id}`,
        attributes: { type: 'button' }
      });
      addAreaBtn.disabled = locked;
      const header = createElement('div', { className: 'tree-row tree-row--building' },
        createElement('button', {
          className: `tree-row__label ${selected ? 'is-active' : ''}`,
          text: `▾ ${building.name}`,
          testId: `building-tree-${building.id}`,
          attributes: { type: 'button' }
        }),
        addAreaBtn
      );
      header.querySelector('.tree-row__label').addEventListener('click', () => {
        store.execute(createSelectBuildingCommand(building.id));
      });
      addAreaBtn.addEventListener('click', () => {
        if (locked) return;
        store.execute(createStartAreaCreateCommand(building.id));
      });

      const children = (building.observationAreas ?? []).map((area, index) => {
        const row = createElement('button', {
          className: 'tree-row tree-row--area',
          text: `${areaLabel(area, index)} · ${area.floor} 层`,
          testId: `area-tree-${area.id}`,
          attributes: { type: 'button' }
        });
        row.addEventListener('click', () => {
          if (locked) {
            store.execute(createSelectBuildingCommand(building.id));
          } else {
            store.execute(createStartAreaEditCommand(building.id, area.id));
          }
        });
        return row;
      });

      return createElement('div', { className: 'tree-node' }, header, ...children);
    });

    list.replaceChildren(...nodes);
  }

  store.subscribe(render);
  render(store.getState());
  return element;
}
