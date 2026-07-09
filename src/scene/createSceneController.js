import * as THREE from 'three';
import { createQualitySettings } from '../features/settings/QualitySettings.js';
import { buildAnalysisOverlays } from './analysisOverlays.js';
import { createBuildingMesh } from './buildingMesh.js';
import { createCameraRig } from './createCameraRig.js';
import { applyRectEdit, createAreaDrag } from './areaDrag.js';
import { createFloorSlab, createWallOutline, floorFocusTarget } from './floorFocus.js';
import { applyBuildingTransform } from './buildingSceneHelpers.js';
import { createObservationOverlay } from './observationOverlay.js';
import { createOpeningOverlay } from './openingOverlay.js';
import { createRenderer } from './createRenderer.js';
import { createScene } from './createScene.js';
import { pointerToNdc, resolvePickedEntity } from './picking.js';
import { deriveScenePreview } from './scenePreview.js';
import { applySunLighting } from './sunLighting.js';
import { createSceneSynchronizer } from './syncScene.js';
import { createUpdateAreaEditingCommand } from '../store/buildingCommands.js';

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
    if (floorFocus) return;
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

  function disposeFloorFocus() {
    if (!floorFocus) return;
    floorFocus.clearPreview();
    sceneParts.scene.remove(floorFocus.slab);
    sceneParts.scene.remove(floorFocus.outline);
    floorFocus.drag.dispose();
    floorFocus = null;
  }

  function buildFloorFocus(project) {
    const editing = project.view.areaEditing;
    if (!editing) return;
    const buildingId = editing.buildingId;
    const floor = editing.floor;
    const building = project.buildings.find(b => b.id === buildingId);
    if (!building) return;

    for (const child of sceneParts.buildings.children) child.visible = false;

    const { target, height } = floorFocusTarget(building, floor);
    cameraParts.setTopView(target, height);
    cameraParts.setTopdownMode(true);

    const slab = createFloorSlab(building, floor);
    const outline = createWallOutline(building, floor);
    sceneParts.scene.add(slab);
    sceneParts.scene.add(outline);

    let previewGroup = null;
    const clearPreview = () => {
      if (previewGroup) {
        previewGroup.traverse(c => c.geometry?.dispose());
        sceneParts.overlays.remove(previewGroup);
        previewGroup = null;
      }
    };

    const getBuilding = () => store.getState().buildings.find(b => b.id === buildingId);
    const getMode = () => floorFocus?.tool ?? 'draw';
    const drag = createAreaDrag({
      canvas, camera: cameraParts.camera, floorY: target.y, getBuilding, getMode,
      onPreview: rect => {
        clearPreview();
        if (!rect) return;
        previewGroup = createObservationOverlay({ rects: [rect], baseY: target.y, draft: true });
        applyBuildingTransform(previewGroup, getBuilding());
        sceneParts.overlays.add(previewGroup);
      },
      onCommit: (rect, mode) => {
        clearPreview();
        if (!store) return;
        const editingState = store.getState().view.areaEditing;
        if (!editingState) return;
        const rects = applyRectEdit(editingState.rects ?? [], rect, mode);
        store.execute(createUpdateAreaEditingCommand({ rects }));
      }
    });
    floorFocus = { slab, outline, drag, tool: editing.tool ?? 'draw', clearPreview };
  }

  // Reconcile floor-focus lifecycle from the editing session. The controller owns
  // its own diffing (like syncScene does for meshes) so main.js just calls this
  // unconditionally on every project change.
  function syncFloorFocus(project) {
    const editing = project.view.areaEditing;
    const sig = editing ? `${editing.buildingId}:${editing.floor}` : '';
    if (!editing) {
      if (floorFocus) {
        disposeFloorFocus();
        for (const child of sceneParts.buildings.children) child.visible = true;
        cameraParts.setTopdownMode(false);
      }
      return;
    }
    if (!floorFocus || floorFocus.sig !== sig) {
      if (floorFocus) disposeFloorFocus();
      buildFloorFocus(project);
      if (floorFocus) floorFocus.sig = sig;
    } else {
      floorFocus.tool = editing.tool ?? 'draw';
    }
  }

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
    updateSolar(simulationState, phase = 'present') {
      applySunLighting(sceneParts.sunlight, simulationState.solar, { phase });
      const direction = simulationState.solar.direction;
      canvas.dataset.sunDirection = [direction.x, direction.y, direction.z]
        .map(value => value.toFixed(4))
        .join(',');
      canvas.dataset.sunAboveHorizon = String(simulationState.solar.aboveHorizon);
    },
    updateAnalysis(project, simulationState, phase = 'present') {
      sceneParts.overlays.clear();
      const overlays = buildAnalysisOverlays(project, simulationState, phase);
      if (!overlays) return;
      const areaGroup = createObservationOverlay({
        rects: overlays.area.rects, baseY: overlays.area.baseY,
        lit: overlays.area.lit, draft: overlays.area.draft
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
    syncFloorFocus(project) {
      syncFloorFocus(project);
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
