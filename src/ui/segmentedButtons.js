import { createElement } from './createElement.js';

// A row of mutually-exclusive buttons (the active one is highlighted and inert).
// Shared by the floor selector and the room-edit tool row. `options` is a list of
// { value, label, title?, testId? }; `onSelect(value)` fires for a non-active click.
export function segmentedButtons({ options, activeValue, onSelect, className = 'segmented', btnClassName = 'segmented__btn', testId }) {
  const group = createElement('div', {
    className, testId, attributes: { role: 'group' }
  });
  for (const option of options) {
    const active = option.value === activeValue;
    const btn = createElement('button', {
      className: btnClassName + (active ? ' is-active' : ''),
      text: option.label, testId: option.testId,
      attributes: {
        type: 'button', 'aria-pressed': String(active),
        ...(option.title ? { title: option.title } : {}),
        ...(option.ariaLabel ? { 'aria-label': option.ariaLabel } : {})
      }
    });
    if (!active) btn.addEventListener('click', () => onSelect(option.value));
    group.append(btn);
  }
  return group;
}
