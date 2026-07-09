import { BUILDING_TEMPLATES } from '../../domain/buildings/templates.js';
import { createSetEditorModeCommand, createRemoveBuildingCommand, createStartAreaCreateCommand } from '../../store/buildingCommands.js';
import { createElement } from '../../ui/createElement.js';

export function createBuildingOverview({ store, confirmDelete = () => true }) {
  const title = createElement('h2', { className: 'panel__title', testId: 'overview-title' });
  const summary = createElement('dl', { className: 'metric-list' });
  const editBuilding = createElement('button', {
    className: 'button button--primary', text: '编辑建筑',
    testId: 'overview-edit-building', attributes: { type: 'button', 'data-primary-control': '' }
  });
  const editAreas = createElement('button', {
    className: 'button button--secondary', text: '新建观察区',
    testId: 'overview-edit-areas', attributes: { type: 'button' }
  });
  const remove = createElement('button', {
    className: 'button button--danger', text: '删除建筑',
    testId: 'overview-delete', attributes: { type: 'button' }
  });

  let current = null;
  editBuilding.addEventListener('click', () => store.execute(createSetEditorModeCommand('building')));
  editAreas.addEventListener('click', () => {
    if (current) store.execute(createStartAreaCreateCommand(current.id));
  });
  remove.addEventListener('click', () => {
    if (current && confirmDelete(current)) store.execute(createRemoveBuildingCommand(current.id));
  });

  const element = createElement(
    'div', { className: 'building-overview', testId: 'building-overview' },
    createElement('div', { className: 'panel__label', text: '建筑概览' }),
    title, summary,
    createElement('div', { className: 'inspector-actions' }, editBuilding, editAreas, remove)
  );

  function row(term, value) {
    return [createElement('dt', { text: term }), createElement('dd', { text: value })];
  }
  function update(b) {
    current = b;
    const locked = store.getState()?.view?.phase === 'present';
    editBuilding.disabled = locked;
    editAreas.disabled = locked;
    title.textContent = b.name;
    const label = BUILDING_TEMPLATES[b.template]?.label ?? b.template;
    summary.replaceChildren(
      ...row('类型', label),
      ...row('长 × 深', `${b.params.length} × ${b.params.depth} 米`),
      ...row('楼层 × 层高', `${b.params.floors} 层 × ${b.params.floorHeight} 米`),
      ...row('旋转', `${b.rotation}°`),
      ...row('观察区', `${b.observationAreas?.length ?? 0} 个`),
      ...row('窗 / 采光口', `${b.openings?.length ?? 0} 个`)
    );
  }
  return { element, update };
}
