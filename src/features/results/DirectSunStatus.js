import { createElement } from '../../ui/createElement.js';

export function createDirectSunStatus() {
  const element = createElement('div', {
    className: 'status-pill',
    text: '计算中',
    testId: 'direct-sun-status'
  });
  return {
    element,
    update(hasDirectSun) {
      element.className = hasDirectSun
        ? 'status-pill status-pill--positive'
        : 'status-pill status-pill--neutral';
      element.textContent = hasDirectSun ? '有直射' : '无直射';
    }
  };
}
