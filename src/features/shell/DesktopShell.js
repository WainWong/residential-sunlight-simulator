import { createSelectBuildingCommand } from '../../store/buildingCommands.js';
import { createElement } from '../../ui/createElement.js';

function treeRow(label, className = '', testId = null) {
  return createElement('button', {
    className: `tree-row ${className}`,
    text: label,
    testId,
    attributes: { type: 'button' }
  });
}

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
    if (project.buildings.length === 0) {
      list.replaceChildren(createElement('p', {
        className: 'tree-empty',
        text: '暂无建筑。添加后可在这里选择和编辑。'
      }));
      return;
    }
    list.replaceChildren(...project.buildings.map(building => {
      const selected = building.id === project.view.selectedBuildingId;
      const row = treeRow(
        `▾ ${building.name}`,
        selected ? 'is-active' : '',
        `building-tree-${building.id}`
      );
      row.addEventListener('click', () => {
        store.execute(createSelectBuildingCommand(building.id));
      });
      return row;
    }));
  }

  store.subscribe(render);
  render(store.getState());
  return element;
}
