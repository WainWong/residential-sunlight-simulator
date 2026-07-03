import { createElement } from '../../ui/createElement.js';

const TABS = [
  ['建筑', '建筑编辑'],
  ['区域', '观察区域'],
  ['模拟', '太阳模拟'],
  ['结果', '分析结果']
];

export function createMobileControls() {
  const title = createElement('h2', {
    className: 'mobile-sheet__title',
    text: '太阳模拟',
    testId: 'mobile-sheet-title'
  });
  const sheet = createElement(
    'section',
    { className: 'mobile-sheet' },
    createElement('div', { className: 'mobile-sheet__handle', attributes: { 'aria-hidden': 'true' } }),
    createElement('div', { className: 'panel__label', text: '当前工具' }),
    title,
    createElement('p', {
      className: 'mobile-sheet__summary',
      text: '拖动时间轴，查看阳光进入观察区域的位置。'
    })
  );
  const navigation = createElement('nav', {
    className: 'mobile-nav',
    testId: 'mobile-nav',
    attributes: { 'aria-label': '工作区导航' }
  });

  for (const [label, sheetTitle] of TABS) {
    const button = createElement('button', {
      className: label === '模拟' ? 'mobile-nav__item is-active' : 'mobile-nav__item',
      text: label,
      attributes: { type: 'button', 'data-primary-control': '' }
    });
    button.addEventListener('click', () => {
      title.textContent = sheetTitle;
      navigation.querySelectorAll('button').forEach(item => item.classList.remove('is-active'));
      button.classList.add('is-active');
    });
    navigation.append(button);
  }

  return { sheet, navigation };
}
