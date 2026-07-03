import { createDefaultProject } from './domain/project/defaultProject.js';
import { createWebGLFallback, supportsWebGL } from './features/compatibility/WebGLFallback.js';
import { downloadProject } from './features/project/exportProject.js';
import { exportScreenshot } from './features/project/exportScreenshot.js';
import { readProjectFile } from './features/project/importProject.js';
import { loadDraft, saveDraft } from './features/project/localDraft.js';
import { createAppShell } from './features/shell/AppShell.js';
import { createWizard } from './features/wizard/Wizard.js';
import { createElement } from './ui/createElement.js';
import { showToast } from './ui/Toast.js';

export const APP_NAME = '日照 · 住宅采光模拟器';

export function mountApp(root) {
  let currentProject = loadDraft() ?? createDefaultProject();
  let draftTimer = null;
  let draftNoticeShown = false;
  const shell = createAppShell();
  root.replaceChildren(shell);

  const canvas = shell.querySelector('#scene-canvas');
  let sceneController = null;
  const sceneReady = supportsWebGL()
    ? import('./scene/createSceneController.js').then(({ createSceneController }) => {
        sceneController = createSceneController(canvas);
        sceneController.updateProject(currentProject);
        return sceneController;
      })
    : Promise.resolve(null);
  if (!supportsWebGL()) canvas.parentElement.append(createWebGLFallback());

  function queueDraft(project) {
    currentProject = structuredClone(project);
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => saveDraft(currentProject), 500);
    shell.dataset.projectBuildings = String(currentProject.buildings.length);
    if (sceneController) sceneController.updateProject(currentProject);
    else sceneReady.then(controller => controller?.updateProject(currentProject));
    if (!draftNoticeShown) {
      draftNoticeShown = true;
      showToast('编辑内容会作为本机草稿保存，不会上传。');
    }
  }

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
      onProjectChange: queueDraft
    }));
  });
  shell.querySelector('.header-actions')?.prepend(newProject);

  shell.querySelector('[data-action="save-project"]')?.addEventListener('click', () => {
    downloadProject(currentProject);
    showToast('项目文件已生成。', 'success');
  });

  const importInput = createElement('input', {
    attributes: { type: 'file', accept: '.json,.sunlight.json', hidden: '' }
  });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      queueDraft(await readProjectFile(file));
      showToast('项目已导入。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      importInput.value = '';
    }
  });
  shell.append(importInput);
  shell.querySelector('[data-action="import-project"]')?.addEventListener('click', () => importInput.click());

  shell.querySelector('[data-action="export-screenshot"]')?.addEventListener('click', async () => {
    try {
      await exportScreenshot(canvas, {
        city: currentProject.location.cityId === 'shenzhen' ? '深圳' : currentProject.location.cityId,
        date: currentProject.simulation.date,
        time: currentProject.simulation.time
      });
      showToast('场景截图已生成。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#app');
  if (root) mountApp(root);
}

