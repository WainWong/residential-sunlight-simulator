import * as THREE from 'three';
import { createQualitySettings } from '../features/settings/QualitySettings.js';
import { buildAnalysisOverlays } from './analysisOverlays.js';
import { createBuildingMesh } from './buildingMesh.js';
import { createCameraRig } from './createCameraRig.js';
import { applyRectEdit, createAreaDrag } from './areaDrag.js';
import { createFloorSlab, floorFocusTarget, floorVisibility } from './floorFocus.js';
import { createObservationOverlay } from './observationOverlay.js';
import { createOpeningOverlay } from './openingOverlay.js';
import { createRenderer } from './createRenderer.js';
import { createScene } from './createScene.js';
import { pointerToNdc, resolvePickedEntity } from './picking.js';
import { deriveScenePreview } from './scenePreview.js';
import { applySunLighting } from './sunLighting.js';
import { createSceneSynchronizer } from './syncScene.js';
import { createUpdateObservationAreaCommand } from '../store/buildingCommands.js';

export function createSceneController(canvas, { onSelect = () => {}, store = null } = {}) {
  const quality = createQualitySettings('medium');
  const sceneParts = createScene();
  const rendererParts = createRenderer(canvas);
  const cameraParts = createCameraRig(canvas);
  const synchronizer = createSceneSynchronizer({
    rebuild: createBuildingMesh,
    attach: object => sceneParts.buildings.add(object),
    detach: object => sceneParts.buildings.remove(object)
  });
  const viewport = canvas.parentElement;

  function resize() {
    const rect = viewport.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    rendererParts.resize(width, height, quality.value.pixelRatio);
    rendererParts.renderer.shadowMap.enabled = quality.value.shadows;
    cameraParts.resize(width, height);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function selectAtPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const ndc = pointerToNdc(event, rect);
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, cameraParts.camera);
    const intersections = raycaster.intersectObjects(sceneParts.buildings.children, true);
    const entityId = resolvePickedEntity(intersections);
    if (entityId) onSelect(entityId);
  }

  canvas.addEventListener('click', selectAtPointer);

  let floorFocus = null;

  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();
  rendererParts.renderer.setAnimationLoop(() => {
    cameraParts.controls.update();
    rendererParts.renderer.render(sceneParts.scene, cameraParts.camera);
  });

  return {
    updateProject(project) {
      const { previewBuildingId, highlightBuildingId } = deriveScenePreview(project.view);
      synchronizer.update(project.buildings, { previewBuildingId, highlightBuildingId });
      canvas.dataset.buildingCount = String(project.buildings.length);
      canvas.dataset.previewBuildingId = previewBuildingId ?? '';
    },
    updateSolar(simulationState) {
      applySunLighting(sceneParts.sunlight, simulationState.solar);
      const direction = simulationState.solar.direction;
      canvas.dataset.sunDirection = [direction.x, direction.y, direction.z]
        .map(value => value.toFixed(4))
        .join(',');
      canvas.dataset.sunAboveHorizon = String(simulationState.solar.aboveHorizon);
    },
    updateAnalysis(project, simulationState) {
      sceneParts.overlays.clear();
      const overlays = buildAnalysisOverlays(project, simulationState);
      if (!overlays) return;
      const areaGroup = createObservationOverlay({
        rects: overlays.area.rects, baseY: overlays.area.baseY, lit: overlays.area.lit
      });
      areaGroup.position.set(overlays.area.group.position.x, 0, overlays.area.group.position.z);
      areaGroup.rotation.y = THREE.MathUtils.degToRad(overlays.area.group.rotationDeg);
      sceneParts.overlays.add(areaGroup);
      for (const opening of overlays.openings) {
        sceneParts.overlays.add(createOpeningOverlay(opening));
      }
    },
    setPreviewing(value) {
      quality.setPreviewing(value);
      resize();
    },
    enterFloorFocus(project, simulationState) {
      if (floorFocus) return;
      const buildingId = project.view.selectedBuildingId;
      const building = project.buildings.find(b => b.id === buildingId);
      if (!building) return;
      const areaId = simulationState.activeAreaId;
      const area = (building.observationAreas ?? []).find(a => a.id === areaId);
      const floor = area?.floor ?? 1;
      const isVisible = floorVisibility(project.buildings, buildingId);
      for (const child of sceneParts.buildings.children) {
        child.visible = isVisible(child.userData?.entityId);
      }
      const { target, height } = floorFocusTarget(building, floor);
      cameraParts.setTopView(target, height);
      cameraParts.controls.enabled = false;
      const slab = createFloorSlab(building, floor);
      sceneParts.scene.add(slab);
      const getBuilding = () => project.buildings.find(b => b.id === buildingId);
      const getMode = () => canvas.closest('.workspace')?.querySelector('.area-floor-tool')?.dataset.tool ?? 'move';
      const drag = createAreaDrag({
        canvas,
        camera: cameraParts.camera,
        floorY: target.y,
        getBuilding,
        getMode,
        onCommit: (rect, mode) => {
          if (!store || !areaId) return;
          const current = getBuilding();
          const currentArea = (current.observationAreas ?? []).find(a => a.id === areaId);
          const rects = applyRectEdit(currentArea?.rects ?? [], rect, mode);
          store.execute(createUpdateObservationAreaCommand(buildingId, areaId, { rects }));
        }
      });
      floorFocus = { slab, drag };
    },
    exitFloorFocus() {
      if (!floorFocus) return;
      sceneParts.scene.remove(floorFocus.slab);
      floorFocus.drag.dispose();
      for (const child of sceneParts.buildings.children) child.visible = true;
      cameraParts.controls.enabled = true;
      floorFocus = null;
    },
    dispose() {
      canvas.removeEventListener('click', selectAtPointer);
      observer.disconnect();
      rendererParts.renderer.setAnimationLoop(null);
      synchronizer.dispose();
      sceneParts.overlays.clear();
      cameraParts.dispose();
      rendererParts.dispose();
    }
  };
}
