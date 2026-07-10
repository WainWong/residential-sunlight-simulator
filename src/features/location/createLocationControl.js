import { createElement } from '../../ui/createElement.js';
import { createLocationPicker } from './createLocationPicker.js';

function locationLabel(project) {
  const loc = project.location ?? {};
  if (loc.label) return loc.label;
  if (loc.cityId === 'shenzhen') return '深圳';
  return loc.cityId ?? '地点';
}

export function createLocationControl({ store }) {
  const picker = createLocationPicker({ store });

  const button = createElement('button', {
    className: 'button button--ghost location-control__btn',
    testId: 'location-button',
    attributes: { type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' }
  });

  const popover = createElement('div',
    { className: 'location-control__popover panel', testId: 'location-popover', attributes: { hidden: '' } },
    createElement('div', { className: 'panel__label', text: '地点设置' }),
    picker.element
  );

  const element = createElement('div', { className: 'location-control', testId: 'location-control' }, button, popover);

  function open(openState) {
    popover.hidden = !openState;
    button.setAttribute('aria-expanded', String(openState));
    if (openState) picker.update(store.getState());
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    open(popover.hidden);
  });

  // Close on outside click. The button click is stopped above so it only toggles.
  document.addEventListener('click', (event) => {
    if (popover.hidden) return;
    if (!element.contains(event.target)) open(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !popover.hidden) open(false);
  });

  function sync(project) {
    button.textContent = `📍 ${locationLabel(project)}`;
  }

  store.subscribe(sync);
  sync(store.getState());
  return { element, button, popover, open };
}
