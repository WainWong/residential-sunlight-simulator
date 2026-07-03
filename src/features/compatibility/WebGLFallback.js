import { createElement } from '../../ui/createElement.js';

export function supportsWebGL() {
  const canvas = document.createElement('canvas');
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
}

export function createWebGLFallback() {
  return createElement(
    'section',
    { className: 'webgl-fallback', testId: 'webgl-fallback' },
    createElement('div', { className: 'webgl-fallback__mark', text: '3D' }),
    createElement('h2', { text: '浏览器无法启动 3D 场景' }),
    createElement('p', {
      text: '请开启浏览器硬件加速，或使用最新版 Chrome、Edge、Safari 再试。你的项目数据仍保存在本机。'
    })
  );
}
