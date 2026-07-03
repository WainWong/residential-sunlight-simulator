import { createElement } from '../../ui/createElement.js';

export function createAreaInspector() {
  const area = createElement('strong', {
    className: 'area-stat__value',
    text: '0㎡',
    testId: 'selected-area'
  });
  const cells = createElement('span', { className: 'area-stat__caption', text: '尚未选择格子' });
  const element = createElement(
    'div',
    { className: 'area-stat' },
    createElement('span', { className: 'panel__label', text: '已选面积' }),
    area,
    cells
  );

  return {
    element,
    update(count) {
      area.textContent = `${count}㎡`;
      cells.textContent = count ? `${count} 个 1m × 1m 网格` : '尚未选择格子';
    }
  };
}
