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
import { createInteriorLightController } from './features/interior/createInteriorLightController.js';
import { createAnalysisClient } from './workers/createAnalysisClient.js';
import { sampleSurfaces } from './domain/simulation/sampleSurfaces.js';
import { floorBaseY } from './domain/buildings/floorMath.js';
import { rotateLocalToWorld } from './domain/buildings/wallGeometry.js';
import { buildObstacles } from './domain/simulation/buildObstacles.js';
import { buildAreaWallQuads } from './domain/simulation/buildAreaWallQuads.js';
import { deriveAperturesFromArea } from './domain/simulation/deriveApertures.js';
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
          compassNeedle: shell.querySelector('[data-testid="compass-needle"]'),
          compassReadout: shell.querySelector('[data-testid="compass-readout"]'),
          onSelect: buildingId => {
            store.execute(createSelectBuildingCommand(buildingId));
          }
        });
        const project0 = store.getState();
        const sim0 = simulationController.getState();
        sceneController.updateProject(project0);
        sceneController.updateSolar(sim0, project0.view.phase);
        sceneController.updateAnalysis(project0, sim0, project0.view.phase);
        return sceneController;
      })
    : Promise.resolve(null);
  if (!webglAvailable) canvas.parentElement.append(createWebGLFallback());

  const withController = fn => (sceneController ? fn(sceneController) : sceneReady.then(fn));

  // --- Interior daylight lifecycle (present-phase "enter observation area") ---
  let analysisClient = null;
  let interiorCtrl = null;
  let interiorKey = null;

  function areaWorldTransform(building, area) {
    const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
    return {
      baseY,
      transform: ([lx, , lz]) => {
        const [wx, wz] = rotateLocalToWorld([lx, lz], building.rotation);
        return [wx + building.position.x, baseY, wz + building.position.z];
      }
    };
  }

  function interiorPayload(project, building, area, solar) {
    const { transform } = areaWorldTransform(building, area);
    const { surfaces } = sampleSurfaces(area, { floorHeight: building.params.floorHeight }, transform);
    const { portals } = deriveAperturesFromArea(building, area);
    // Walls stay in the obstacle set; only portal openings let light through.
    // The area's own partition walls block light too.
    const obstacles = [
      ...buildObstacles(project.buildings),
      ...buildAreaWallQuads(building, area)
    ];
    return {
      surfaces,
      openings: portals,
      obstacles,
      sunDirection: [solar.direction.x, solar.direction.y, solar.direction.z]
    };
  }

  function teardownInterior() {
    interiorCtrl?.dispose(); interiorCtrl = null;
    analysisClient?.dispose(); analysisClient = null;
    withController(controller => controller?.exitInterior());
  }

  function syncInterior(project, sim) {
    const it = project.view.interior;
    const key = it ? `${it.buildingId}:${it.areaId}` : null;
    const building = it ? project.buildings.find(b => b.id === it.buildingId) : null;
    const area = building?.observationAreas?.find(a => a.id === it.areaId) ?? null;

    if (key === interiorKey) {
      if (it && building && area) interiorCtrl?.request(interiorPayload(project, building, area, sim.solar));
      return;
    }

    if (interiorKey) teardownInterior();
    interiorKey = key;
    if (!it || !building || !area) { interiorKey = null; return; }

    const { transform, baseY } = areaWorldTransform(building, area);
    const { surfaces } = sampleSurfaces(area, { floorHeight: building.params.floorHeight }, transform);
    const xs = surfaces.flatMap(s => s.samples.map(p => p.position[0]));
    const zs = surfaces.flatMap(s => s.samples.map(p => p.position[2]));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const radius = Math.max(6, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2);

    // Mark each opening (where the area meets an exterior wall) so it's
    // obvious where the sunlight can enter.
    const { portals } = deriveAperturesFromArea(building, area);
    const openingMarkers = portals.map(p => ({
      id: p.id,
      width: p.bounds.maxU - p.bounds.minU,
      height: p.bounds.maxV - p.bounds.minV,
      center: [p.plane.point[0], (p.bounds.minV + p.bounds.maxV) / 2, p.plane.point[2]],
      normal: p.plane.normal
    }));

    withController(controller => controller?.enterInterior({
      building, floor: area.floor, area, surfaces, openingMarkers,
      center: { x: cx, y: baseY + building.params.floorHeight / 2, z: cz }, radius
    }));

    analysisClient = createAnalysisClient();
    interiorCtrl = createInteriorLightController({
      analyze: payload => analysisClient.analyzeInterior(payload),
      onMasks: masks => withController(controller => controller?.updateInteriorLight(masks))
    });
    interiorCtrl.request(interiorPayload(project, building, area, sim.solar));
  }

  let prevEditing = store.getState().view.editorMode === 'building';
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
      controller?.updateSolar(sim, project.view.phase);
      controller?.updateAnalysis(project, sim, project.view.phase);
      controller?.syncFloorFocus(project);
    });
    syncInterior(project, sim);
  });

  simulationController.subscribe(state => {
    withController(controller => {
      controller?.updateSolar(state, store.getState().view.phase);
      controller?.updateAnalysis(store.getState(), state, store.getState().view.phase);
    });
    syncInterior(store.getState(), state);
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
        city: location.label ?? (location.cityId === 'shenzhen' ? '深圳' : location.cityId),
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
