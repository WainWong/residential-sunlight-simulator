export const APP_NAME = '日照 · 住宅采光模拟器';

export function mountApp(root) {
  root.innerHTML = `
    <main class="boot">
      <div class="boot__mark" aria-hidden="true"></div>
      <p class="boot__eyebrow">RESIDENTIAL DAYLIGHT</p>
      <h1>${APP_NAME}</h1>
      <p class="boot__copy">正在准备你的采光场景…</p>
    </main>
  `;
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#app');
  if (root) mountApp(root);
}
