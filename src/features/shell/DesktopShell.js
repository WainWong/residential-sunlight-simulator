import { createElement } from '../../ui/createElement.js';

function treeRow(label, className = '') {
  return createElement('button', {
    className: `tree-row ${className}`,
    text: label,
    attributes: { type: 'button' }
  });
}

export function createProjectTree() {
  return createElement(
    'aside',
    { className: 'project-tree panel', testId: 'project-tree' },
    createElement('div', { className: 'panel__label', text: '场景结构' }),
    createElement('h2', { className: 'panel__title', text: '项目对象' }),
    createElement(
      'div',
      { className: 'tree-list' },
      treeRow('▾ 住宅 A', 'is-active'),
      treeRow('　▾ 第 9 层'),
      treeRow('　　● 客厅观察区', 'is-accent'),
      treeRow('▸ 遮挡建筑 B')
    ),
    createElement('button', {
      className: 'button button--secondary panel__action',
      text: '＋ 添加建筑',
      attributes: { type: 'button', 'data-primary-control': '' }
    })
  );
}

export function createInspector() {
  return createElement(
    'aside',
    { className: 'inspector panel', testId: 'inspector' },
    createElement('div', { className: 'panel__label', text: '当前分析' }),
    createElement('div', { className: 'status-pill status-pill--positive', text: '有直射' }),
    createElement('h2', { className: 'result-duration', text: '5 小时 26 分' }),
    createElement(
      'dl',
      { className: 'metric-list' },
      createElement('dt', { text: '太阳高度角' }),
      createElement('dd', { text: '18.6°' }),
      createElement('dt', { text: '太阳方位角' }),
      createElement('dd', { text: '136.2°' }),
      createElement('dt', { text: '直射时段' }),
      createElement('dd', { text: '09:12–14:38' })
    ),
    createElement('p', {
      className: 'disclaimer',
      text: '结果仅供购房参考，不能替代专业日照合规报告。'
    })
  );
}
