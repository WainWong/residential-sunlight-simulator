import './styles/room-first.css';
import { createDefaultProject } from './domain/project/defaultProject.js';
import { createWebGLFallback, supportsWebGL } from './features/compatibility/WebGLFallback.js';
import { downloadProject } from './features/project/exportProject.js';
import { exportScreenshot } from './features/project/exportScreenshot.js';
import { readProjectFile } from './features/project/importProject.js';
import { loadDraft, saveDraft } from './features/project/localDraft.js';
import { createSimulationController } from './features/results/createSimulationController.js';
import { createAnalysisClient } from './workers/createAnalysisClient.js';
import { createAppShell } from './features/shell/AppShell.js';
import {
  createAddBuildingCommand,
  createClearBuildingsCommand
} from './store/projectCommands.js';
import {
  createReturnExteriorCommand,
  createSelectEntityCommand,
  createViewRoomSunlightCommand
} from './store/roomCommands.js';
import { createStore } from './store/createStore.js';
import { floorBaseY } from './domain/buildings/floorMath.js';
import { rotateLocalToWorld } from './domain/buildings/wallGeometry.js';
import { createElement } from './ui/createElement.js';
import { showToast } from './ui/Toast.js';

export const APP_NAME = '日照 · 住宅采光模拟器';

function scenePhase(project) {
  return project.view.phase === 'sunlight' ? 'present' : 'edit';
}


export function mountApp(root) {
  const store = createStore(loadDraft() ?? createDefaultProject());
  const simulationController = createSimulationController(store, { analysisClientFactory: createAnalysisClient });
  let sceneController = null;
  let saveTimer = null;

  function scheduleSave(project) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { saveDraft(project); }
      catch { showToast('无法保存本机草稿，请检查浏览器存储空间。', 'error'); }
    }, 300);
  }

  const shell = createAppShell({
    store,
    simulationController,
    onAddBuilding: () => store.execute(createAddBuildingCommand()),
    onClearSandbox: () => {
      if (globalThis.confirm('清空后将删除所有建筑、房间和墙上开口。确定继续吗？')) {
        store.execute(createClearBuildingsCommand());
        saveDraft(store.getState());
      }
    },
    confirmDeleteBuilding: building => globalThis.confirm(`确定删除“${building.name}”及其中的房间和开口吗？`)
  });
  root.replaceChildren(shell);

  const canvas = shell.querySelector('#scene-canvas');
  const webglAvailable = supportsWebGL();
  const sceneReady = webglAvailable
    ? import('./scene/createSceneController.js').then(({ createSceneController }) => {
        sceneController = createSceneController(canvas, {
          store,
          compassNeedle: shell.querySelector('[data-testid="compass-needle"]'),
          compassReadout: shell.querySelector('[data-testid="compass-readout"]'),
          onSelect: picked => {
            const selection = typeof picked === 'string' ? { kind: 'building', id: picked } : picked;
            if (!selection) return;
            const project = store.getState();
            if (project.view.phase === 'sunlight' && selection.kind === 'building') {
              store.execute(createReturnExteriorCommand(selection.id));
            } else if (project.view.phase === 'sunlight' && selection.kind === 'room') {
              store.execute(createViewRoomSunlightCommand(selection.buildingId, selection.id));
            } else {
              store.execute(createSelectEntityCommand(selection));
            }
          }
        });
        const project = store.getState();
        const simulation = simulationController.getState();
        sceneController.updateProject(project);
        sceneController.updateSolar(simulation, scenePhase(project));
        sceneController.updateAnalysis(project, simulation, scenePhase(project));
        sceneController.syncFloorFocus(project);
        return sceneController;
      })
    : Promise.resolve(null);
  if (!webglAvailable) canvas.parentElement.append(createWebGLFallback());
  const withController = fn => (sceneController ? fn(sceneController) : sceneReady.then(fn));
  shell.addEventListener('face-wall', event => {
    withController(controller => controller?.faceWall(event.detail));
  });

  let interiorKey = null;
  function syncInterior(project) {
    const roomId = project.view.interiorRoomId;
    let building = null; let room = null;
    for (const candidate of project.buildings) {
      const found = (candidate.rooms ?? []).find(item => item.id === roomId);
      if (found) { building = candidate; room = found; break; }
    }
    const key = building && room ? `${building.id}:${room.id}` : null;
    if (key === interiorKey) return;
    if (interiorKey) withController(controller => controller?.exitInterior());
    interiorKey = key;
    if (!building || !room) return;
    const baseY = floorBaseY({ floor: room.floor, ...building.params });
    const corners = room.rects.flatMap(rect =>
      [[rect.x0, rect.z0], [rect.x0, rect.z1], [rect.x1, rect.z0], [rect.x1, rect.z1]].map(([x, z]) => {
        const [wx, wz] = rotateLocalToWorld([x, z], building.rotation);
        return [wx + building.position.x, wz + building.position.z];
      }));
    if (corners.length === 0) return;
    const xs = corners.map(point => point[0]); const zs = corners.map(point => point[1]);
    const center = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: baseY + building.params.floorHeight / 2,
      z: (Math.min(...zs) + Math.max(...zs)) / 2
    };
    const radius = Math.max(6, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2);
    withController(controller => controller?.enterInterior({ building, floor: room.floor, center, radius }));
  }

  let prevEditing = Boolean(store.getState().view.roomEditing);
  store.subscribe(project => {
    const currentEditing = Boolean(project.view.roomEditing);
    if (!currentEditing && prevEditing) {
      clearTimeout(saveTimer);
      try { saveDraft(project); } catch { /* next scheduled save reports */ }
    } else scheduleSave(project);
    prevEditing = currentEditing;
    shell.dataset.projectBuildings = String(project.buildings.length);
    const emptyHint = shell.querySelector('.viewport__empty');
    if (emptyHint) emptyHint.hidden = project.buildings.length > 0;
    const simulation = simulationController.getState();
    withController(controller => {
      controller?.updateProject(project);
      controller?.updateSolar(simulation, scenePhase(project));
      controller?.updateAnalysis(project, simulation, scenePhase(project));
      controller?.syncFloorFocus(project);
    });
    syncInterior(project);
  });

  simulationController.subscribe(simulation => {
    const project = store.getState();
    withController(controller => {
      controller?.updateSolar(simulation, scenePhase(project));
      controller?.updateAnalysis(project, simulation, scenePhase(project));
    });
  });

  shell.querySelector('[data-action="save-project"]')?.addEventListener('click', () => {
    downloadProject(store.getState());
    showToast('项目文件已生成。', 'success');
  });
  const importInput = createElement('input', { attributes: { type: 'file', accept: '.json,.sunlight.json', hidden: '' } });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try { store.replaceProject(await readProjectFile(file)); showToast('项目已导入。', 'success'); }
    catch (error) { showToast(error.message, 'error'); }
    finally { importInput.value = ''; }
  });
  shell.append(importInput);
  shell.querySelector('[data-action="import-project"]')?.addEventListener('click', () => importInput.click());
  shell.querySelector('[data-action="export-screenshot"]')?.addEventListener('click', async () => {
    const { location, simulation } = store.getState();
    try {
      await exportScreenshot(canvas, {
        city: location.label ?? (location.cityId === 'shenzhen' ? '深圳' : location.cityId),
        date: simulation.date, time: simulation.time
      });
      showToast('场景截图已生成。', 'success');
    } catch (error) { showToast(error.message, 'error'); }
  });
  shell.dataset.projectBuildings = String(store.getState().buildings.length);
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('#app');
  if (root) mountApp(root);
}
