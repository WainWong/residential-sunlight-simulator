import { createElement } from '../../ui/createElement.js';

export function createFloorSelector({ floor = 1, maxFloor = 33 }, onChange) {
  const input = createElement('input', {
    className: 'input',
    attributes: {
      type: 'number',
      min: '1',
      max: String(maxFloor),
      value: String(floor),
      'aria-label': '目标楼层'
    }
  });
  input.addEventListener('input', () => {
    const next = Math.max(1, Math.min(maxFloor, Math.round(Number(input.value) || 1)));
    onChange(next);
  });

  return createElement(
    'label',
    { className: 'field floor-selector' },
    createElement('span', { className: 'field__label', text: `目标楼层（1–${maxFloor}）` }),
    input
  );
}
