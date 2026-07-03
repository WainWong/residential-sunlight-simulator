import { createElement } from '../../ui/createElement.js';
import { createFloorSelector } from '../floors/FloorSelector.js';
import { createAreaPainter } from './AreaPainter.js';

export function createObservationAreaEditor(project, onChange) {
  const building = project.buildings[0];
  const existing = building.observationAreas[0] ?? {
    id: 'area-1',
    name: '客厅观察区',
    floor: 1,
    cells: [],
    sampleHeight: 0
  };
  if (!building.observationAreas.length) building.observationAreas.push(existing);

  function changed() {
    building.revision = (building.revision ?? 0) + 1;
    onChange(project);
  }

  const name = createElement('input', {
    className: 'input',
    attributes: { type: 'text', value: existing.name, 'aria-label': '区域名称' }
  });
  name.addEventListener('change', () => {
    existing.name = name.value.trim() || '观察区域';
    changed();
  });

  return createElement(
    'section',
    { className: 'wizard-section' },
    createElement('p', { className: 'wizard-kicker', text: 'STEP 3 · OBSERVATION AREA' }),
    createElement('h2', { className: 'wizard-heading', text: '圈出你真正关心的位置' }),
    createElement('p', {
      className: 'wizard-copy',
      text: '每个格子代表 1㎡。像涂色一样选择客厅、卧室、书桌或阳台附近的区域。'
    }),
    createElement(
      'div',
      { className: 'area-meta' },
      createElement(
        'label',
        { className: 'field' },
        createElement('span', { className: 'field__label', text: '区域名称' }),
        name
      ),
      createFloorSelector({
        floor: existing.floor,
        maxFloor: building.params.floors
      }, floor => {
        existing.floor = floor;
        changed();
      })
    ),
    createAreaPainter(existing.cells, cells => {
      existing.cells = cells;
      changed();
    })
  );
}
