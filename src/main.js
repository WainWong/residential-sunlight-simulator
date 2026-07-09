import { createDefaultProject } from './domain/project/defaultProject.js';
import { createWebGLFallback, supportsWebGL } from './features/compatibility/WebGLFallback.js';
import { downloadProject } from './features/project/exportProject.js';
import { exportScreenshot } from './features/project/exportScreenshot.js';
import { parseProject, readProjectFile } from './features/project/importProject.js';
import { loadDraft, saveDraft } from './features/project/localDraft.js';
import { createSimulationController } from './features/results/createSimulationController.js';
import { createAppShell } from './features/shell/AppShell.js';
import {
  createAddBuildingCommand,
  createClearBuildingsCommand,
  createSelectBuildingCommand
} from './store/buildingCommands.js';
import { createStore } from './store/createStore.js';
import { createElement } from './ui/createElement.js';
import { showToast } from './ui/Toast.js';

export const APP_NAME = '日照 · 住宅采光模拟器';

export function mountApp(root) {
  const store = createStore(loadDraft() ?? createDefaultProject());
  const simulationController = createSimulationController(store);
  let sceneController = null;
  let saveTimer = null;

  function scheduleSave(project) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        saveDraft(project);
      } catch {
        showToast('无法保存本机草稿，请检查浏览器存储空间。', 'error');
      }
    }, 300);
  }

  function addBuilding() {
    store.execute(createAddBuildingCommand());
  }

  function clearSandbox() {
    if (globalThis.confirm('清空后将删除所有建筑、观察区和窗户。确定继续吗？')) {
      store.execute(createClearBuildingsCommand());
      saveDraft(store.getState());
    }
  }

  const shell = createAppShell({
    store,
    simulationController,
    onAddBuilding: addBuilding,
    onClearSandbox: clearSandbox,
    confirmDeleteBuilding: building =>
      globalThis.confirm(`确定删除"${building.name}"及其观察区和窗户吗？`)
  });
  root.replaceChildren(shell);

  const canvas = shell.querySelector('#scene-canvas');
  const webglAvailable = supportsWebGL();
  const sceneReady = webglAvailable
    ? import('./scene/createSceneController.js').then(({ createSceneController }) => {
        sceneController = createSceneController(canvas, {
          store,
          onSelect: buildingId => {
            store.execute(createSelectBuildingCommand(buildingId));
          }
        });
        sceneController.updateProject(store.getState());
        sceneController.updateSolar(simulationController.getState());
        sceneController.updateAnalysis(store.getState(), simulationController.getState());
        return sceneController;
      })
    : Promise.resolve(null);
  if (!webglAvailable) canvas.parentElement.append(createWebGLFallback());

  const withController = fn => (sceneController ? fn(sceneController) : sceneReady.then(fn));

  let prevEditing = store.getState().view.editorMode === 'building';
  let prevAreaEditing = Boolean(store.getState().view.areaEditing);
  store.subscribe(project => {
    const currentEditing = project.view.editorMode === 'building';
    if (!currentEditing && prevEditing) {
      clearTimeout(saveTimer);
      saveTimer = null;
      try { saveDraft(project); } catch { /* handled in scheduleSave */ }
    } else {
      scheduleSave(project);
    }
    prevEditing = currentEditing;
    shell.dataset.projectBuildings = String(project.buildings.length);
    const emptyHint = shell.querySelector('.viewport__empty');
    if (emptyHint) emptyHint.hidden = project.buildings.length > 0;
    const sim = simulationController.getState();
    withController(controller => {
      controller?.updateProject(project);
      controller?.updateAnalysis(project, sim);
    });

    const currentAreaEditing = Boolean(project.view.areaEditing);
    if (currentAreaEditing !== prevAreaEditing) {
      withController(controller => {
        if (!controller) return;
        if (currentAreaEditing) controller.enterFloorFocus(project);
        else controller.exitFloorFocus();
      });
    } else if (currentAreaEditing) {
      withController(controller => controller?.setFloorTool(project.view.areaEditing.tool));
    }
    prevAreaEditing = currentAreaEditing;
  });

  simulationController.subscribe(state => {
    withController(controller => {
      controller?.updateSolar(state);
      controller?.updateAnalysis(store.getState(), state);
    });
  });

  shell.querySelector('[data-action="save-project"]')?.addEventListener('click', () => {
    downloadProject(store.getState());
    showToast('项目文件已生成。', 'success');
  });

  const importInput = createElement('input', {
    attributes: { type: 'file', accept: '.json,.sunlight.json', hidden: '' }
  });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      store.replaceProject(await readProjectFile(file));
      showToast('项目已导入。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      importInput.value = '';
    }
  });
  shell.append(importInput);
  shell.querySelector('[data-action="import-project"]')?.addEventListener('click', () =>
    importInput.click()
  );

  shell.querySelector('[data-action="export-screenshot"]')?.addEventListener('click', async () => {
    const { location, simulation } = store.getState();
    try {
      await exportScreenshot(canvas, {
        city: location.cityId === 'shenzhen' ? '深圳' : location.cityId,
        date: simulation.date,
        time: simulation.time
      });
      showToast('场景截图已生成。', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  const { buildings } = store.getState();
  shell.dataset.projectBuildings = String(buildings.length);
  const emptyHint = shell.querySelector('.viewport__empty');
  if (emptyHint) emptyHint.hidden = buildings.length > 0;
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#app');
  if (root) mountApp(root);
}
