import { createElement } from '../../ui/createElement.js';

const TABS = [
  ['场景', '场景', 'scene'],
  ['房间', '建筑与房间', 'buildings'],
  ['结果', '直射日光', 'results']
];

export function createMobileControls() {
  const title = createElement('h2', { className: 'mobile-sheet__title', text: '建筑与房间', testId: 'mobile-sheet-title' });
  const sheet = createElement('section', { className: 'mobile-sheet' },
    createElement('div', { className: 'mobile-sheet__handle', attributes: { 'aria-hidden': 'true' } }),
    createElement('div', { className: 'panel__label', text: '浏览' }), title);
  const navigation = createElement('nav', { className: 'mobile-nav', testId: 'mobile-nav', attributes: { 'aria-label': '工作区导航' } });
  for (const [label, sheetTitle, panel] of TABS) {
    const button = createElement('button', {
      className: panel === 'scene' ? 'mobile-nav__item is-active' : 'mobile-nav__item', text: label,
      attributes: { type: 'button', 'data-panel': panel }
    });
    button.addEventListener('click', () => {
      title.textContent = sheetTitle;
      navigation.querySelectorAll('button').forEach(item => item.classList.remove('is-active'));
      button.classList.add('is-active');
      sheet.closest('.app-shell')?.setAttribute('data-mobile-panel', panel);
    });
    navigation.append(button);
  }
  return { sheet, navigation };
}
