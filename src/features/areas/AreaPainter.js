import { createElement } from '../../ui/createElement.js';
import { createAreaInspector } from './AreaInspector.js';

export function createAreaPainter(initialCells, onChange) {
  const selected = new Set(initialCells.map(([x, z]) => `${x}:${z}`));
  let mode = 'paint';
  let enabled = false;
  const grid = createElement('div', {
    className: 'area-grid',
    attributes: { 'aria-label': '观察区域网格' }
  });
  const inspector = createAreaInspector();

  function emit() {
    const cells = [...selected].map(key => key.split(':').map(Number));
    inspector.update(cells.length);
    onChange(cells);
  }

  for (let z = 0; z < 5; z += 1) {
    for (let x = 0; x < 8; x += 1) {
      const key = `${x}:${z}`;
      const cell = createElement('button', {
        className: 'area-cell',
        text: '',
        testId: `grid-cell-${x}-${z}`,
        attributes: {
          type: 'button',
          'aria-label': `网格 ${x + 1}, ${z + 1}`,
          'aria-pressed': 'false'
        }
      });
      cell.addEventListener('click', () => {
        if (!enabled) return;
        if (mode === 'erase') selected.delete(key);
        else selected.add(key);
        const active = selected.has(key);
        cell.classList.toggle('is-selected', active);
        cell.setAttribute('aria-pressed', String(active));
        emit();
      });
      grid.append(cell);
    }
  }

  const edit = createElement('button', {
    className: 'button button--primary',
    text: '编辑观察区域',
    attributes: { type: 'button', 'data-primary-control': '' }
  });
  edit.addEventListener('click', () => {
    enabled = !enabled;
    grid.classList.toggle('is-editing', enabled);
    edit.textContent = enabled ? '完成涂选' : '编辑观察区域';
  });

  const paint = createElement('button', {
    className: 'segmented__button is-active',
    text: '涂选',
    attributes: { type: 'button' }
  });
  const erase = createElement('button', {
    className: 'segmented__button',
    text: '擦除',
    attributes: { type: 'button' }
  });
  paint.addEventListener('click', () => {
    mode = 'paint';
    paint.classList.add('is-active');
    erase.classList.remove('is-active');
  });
  erase.addEventListener('click', () => {
    mode = 'erase';
    erase.classList.add('is-active');
    paint.classList.remove('is-active');
  });

  inspector.update(selected.size);
  return createElement(
    'div',
    { className: 'area-editor' },
    createElement(
      'div',
      { className: 'area-toolbar' },
      edit,
      createElement('div', { className: 'segmented', attributes: { 'aria-label': '网格工具' } }, paint, erase)
    ),
    createElement(
      'div',
      { className: 'area-canvas' },
      createElement(
        'div',
        { className: 'area-canvas__north' },
        createElement('span', { text: 'N' }),
        createElement('span', { text: '北侧外墙' })
      ),
      grid
    ),
    inspector.element
  );
}
