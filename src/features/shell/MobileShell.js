import { createElement } from '../../ui/createElement.js';

const TABS = [
  ['场景', '场景对象', 'buildings'],
  ['建筑', '建筑参数', 'editor'],
  ['模拟', '日期与时间', 'simulation'],
  ['结果', '分析结果', 'results']
];

export function createMobileControls() {
  const title = createElement('h2', {
    className: 'mobile-sheet__title',
    text: '场景对象',
    testId: 'mobile-sheet-title'
  });
  const sheet = createElement(
    'section',
    { className: 'mobile-sheet' },
    createElement('div', { className: 'mobile-sheet__handle', attributes: { 'aria-hidden': 'true' } }),
    createElement('div', { className: 'panel__label', text: '当前工具' }),
    title
  );
  const navigation = createElement('nav', {
    className: 'mobile-nav',
    testId: 'mobile-nav',
    attributes: { 'aria-label': '工作区导航' }
  });

  for (const [label, sheetTitle, panel] of TABS) {
    const button = createElement('button', {
      className: label === '场景' ? 'mobile-nav__item is-active' : 'mobile-nav__item',
      text: label,
      attributes: { type: 'button', 'data-primary-control': '' }
    });
    button.addEventListener('click', () => {
      title.textContent = sheetTitle;
      navigation.querySelectorAll('button').forEach(item => item.classList.remove('is-active'));
      button.classList.add('is-active');
      const appShell = document.querySelector('.app-shell');
      if (appShell) appShell.dataset.mobilePanel = panel;
    });
    navigation.append(button);
  }

  return { sheet, navigation };
}
