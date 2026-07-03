import { createAppShell } from './features/shell/AppShell.js';

export const APP_NAME = '日照 · 住宅采光模拟器';

export function mountApp(root) {
  root.replaceChildren(createAppShell());
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#app');
  if (root) mountApp(root);
}

