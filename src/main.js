import { createAppShell } from './features/shell/AppShell.js';
import { createWizard } from './features/wizard/Wizard.js';
import { createElement } from './ui/createElement.js';

export const APP_NAME = '日照 · 住宅采光模拟器';

export function mountApp(root) {
  const shell = createAppShell();
  const newProject = createElement('button', {
    className: 'button button--ghost',
    text: '新建项目',
    attributes: { type: 'button', 'data-primary-control': '' }
  });
  newProject.addEventListener('click', () => {
    const closeWizard = () => shell.querySelector('.wizard-backdrop')?.remove();
    closeWizard();
    shell.append(createWizard({
      onClose: closeWizard,
      onProjectChange: project => {
        shell.dataset.projectBuildings = String(project.buildings.length);
      }
    }));
  });
  shell.querySelector('.header-actions')?.prepend(newProject);
  root.replaceChildren(shell);
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#app');
  if (root) mountApp(root);
}
