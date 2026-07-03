import { createElement } from './createElement.js';

export function showToast(message, tone = 'info') {
  const toast = createElement('div', {
    className: `toast toast--${tone}`,
    text: message,
    attributes: { role: tone === 'error' ? 'alert' : 'status' }
  });
  document.body.append(toast);
  setTimeout(() => toast.remove(), 3200);
  return toast;
}
