import * as THREE from 'three';
import { createQualitySettings } from '../features/settings/QualitySettings.js';
import { buildAnalysisOverlays } from './analysisOverlays.js';
import { createBuildingMesh } from './buildingMesh.js';
import { createCameraRig } from './createCameraRig.js';
import { applyRectEdit, createAreaDrag } from './areaDrag.js';
import { createFloorSlab, floorFocusTarget } from './floorFocus.js';
import { createInteriorFloor } from './interiorFloor.js';
import { createLightMaps } from './interiorLightMaps.js';
import { createFadeState } from './occlusionFade.js';
import { applyBuildingTransform } from './buildingSceneHelpers.js';
import { createObservationOverlay } from './observationOverlay.js';
import { clipRectToFootprint } from '../domain/buildings/footprintClip.js';
import { rotateLocalToWorld } from '../domain/buildings/wallGeometry.js';
import { createOpeningOverlay } from './openingOverlay.js';
import { createRenderer } from './createRenderer.js';
import { createScene } from './createScene.js';
import { pointerToNdc, resolvePickedEntity } from './picking.js';
import { deriveScenePreview } from './scenePreview.js';
import { applySunLighting } from './sunLighting.js';
import { createSceneSynchronizer } from './syncScene.js';
import { createUpdateAreaEditingCommand } from '../store/buildingCommands.js';

export function createSceneController(canvas, { onSelect = () => {}, store = null, compassNeedle = null, compassReadout = null } = {}) {
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

  let interior = null;
  const _camToCenter = new THREE.Vector3();
  const _hit = new THREE.Raycaster();

  function enterInterior({ building, floor, area, surfaces, center, radius, openingMarkers = [] }) {
    if (interior) exitInterior();
    for (const child of sceneParts.buildings.children) child.visible = false;
    const group = createInteriorFloor(building, floor, area);
    sceneParts.scene.add(group);
    // Highlight each opening so it's clear where sunlight can enter. Portals
    // are in world coordinates, so they go on the scene root (not the
    // building-transformed group).
    const openings = new THREE.Group();
    openings.name = 'interior-openings';
    for (const marker of openingMarkers) {
      const overlay = createOpeningOverlay(marker);
      overlay.renderOrder = 3;
      openings.add(overlay);
    }
    sceneParts.scene.add(openings);
    const lightMaps = createLightMaps(group, surfaces);
    const fades = new Map();
    group.traverse(m => { if (m.material) fades.set(m, createFadeState()); });
    cameraParts.flyToArea({ center, radius });
    interior = { group, openings, lightMaps, fades, center: new THREE.Vector3(center.x, center.y, center.z) };
  }

  function updateInteriorLight(masks) {
    interior?.lightMaps.apply(masks);
  }

  function exitInterior() {
    if (!interior) return;
    interior.lightMaps.dispose();
    interior.group.traverse(c => c.geometry?.dispose());
    sceneParts.scene.remove(interior.group);
    interior.openings?.traverse(c => c.geometry?.dispose());
    if (interior.openings) sceneParts.scene.remove(interior.openings);
    for (const child of sceneParts.buildings.children) child.visible = true;
    cameraParts.setEditControls(null);
    interior = null;
  }

  // Fade any face that sits between the camera and the interior focus point so
  // the user can always see inside. Runs every frame while interior is active.
  function updateOcclusion() {
    if (!interior) return;
    const camPos = cameraParts.camera.position;
    _camToCenter.copy(interior.center).sub(camPos);
    const centerDist = _camToCenter.length();
    _hit.set(camPos, _camToCenter.clone().normalize());
    const meshes = [];
    interior.group.traverse(m => { if (m.material && interior.fades.has(m)) meshes.push(m); });
    const hits = _hit.intersectObjects(meshes, false);
    const occluders = new Set(hits.filter(h => h.distance < centerDist - 0.5).map(h => h.object));
    for (const [mesh, fade] of interior.fades) {
      mesh.material.opacity = fade.update(mesh.material.opacity, occluders.has(mesh));
    }
  }

  function disposeFloorFocus() {
    if (!floorFocus) return;
    floorFocus.clearPreview();
    floorFocus.dimLabel?.remove();
    sceneParts.scene.remove(floorFocus.slab);
    for (const overlay of floorFocus.existing) {
      overlay.traverse(c => c.geometry?.dispose());
      sceneParts.scene.remove(overlay);
    }
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

    // Keep the current camera angle when entering area editing — don't snap to
    // top-down. `target` is still used for the draw plane height and overlay
    // baseY. The user can orbit freely (view mode) until they pick a tool.
    const { target } = floorFocusTarget(building, floor);
    cameraParts.setEditControls(editing.tool);

    const slab = createFloorSlab(building, floor);
    sceneParts.scene.add(slab);

    // Show this floor's other observation areas (already saved) as solid
    // overlays so the user can see existing rooms while drawing a new one.
    const existing = (building.observationAreas ?? [])
      .filter(a => a.floor === floor && a.id !== editing.areaId)
      .map(a => {
        const overlay = createObservationOverlay({ rects: a.rects, baseY: target.y, draft: false });
        applyBuildingTransform(overlay, building);
        sceneParts.scene.add(overlay);
        return overlay;
      });

    // Floating dimension readout shown next to the rect while dragging.
    const dimLabel = document.createElement('div');
    dimLabel.className = 'area-dim-label';
    dimLabel.hidden = true;
    viewport.appendChild(dimLabel);
    const _dimVec = new THREE.Vector3();
    function showDimLabel(rect) {
      if (!rect) { dimLabel.hidden = true; return; }
      const width = Math.abs(rect.x1 - rect.x0);
      const depth = Math.abs(rect.z1 - rect.z0);
      if (width < 1e-6 && depth < 1e-6) { dimLabel.hidden = true; return; }
      dimLabel.textContent = `${width.toFixed(2)} × ${depth.toFixed(2)} 米`;
      // Project the rect center (local floor coords) to screen space.
      const b = getBuilding();
      const cx = (rect.x0 + rect.x1) / 2;
      const cz = (rect.z0 + rect.z1) / 2;
      const [wx, wz] = b ? rotateLocalToWorld([cx, cz], b.rotation) : [cx, cz];
      _dimVec.set(wx + (b?.position.x ?? 0), target.y, wz + (b?.position.z ?? 0));
      _dimVec.project(cameraParts.camera);
      const rectPx = canvas.getBoundingClientRect();
      const px = (_dimVec.x * 0.5 + 0.5) * rectPx.width;
      const py = (-_dimVec.y * 0.5 + 0.5) * rectPx.height;
      dimLabel.style.left = `${px}px`;
      dimLabel.style.top = `${py}px`;
      dimLabel.hidden = false;
    }

    let previewGroup = null;
    const clearPreview = () => {
      if (previewGroup) {
        previewGroup.traverse(c => c.geometry?.dispose());
        sceneParts.overlays.remove(previewGroup);
        previewGroup = null;
      }
    };

    const getBuilding = () => store.getState().buildings.find(b => b.id === buildingId);
    const getMode = () => floorFocus?.tool ?? null;

    // Rects already claimed by other observation areas on this floor — a new
    // draw must not overlap them (keeps floor regions disjoint for later
    // hole/analysis handling). The area being edited is excluded because its
    // working rects live in the session, not in the saved building.
    function existingRectsOnFloor(b) {
      const st = store?.getState()?.view?.areaEditing;
      return (b?.observationAreas ?? [])
        .filter(a => a.floor === st?.floor && a.id !== st?.areaId)
        .flatMap(a => a.rects ?? []);
    }
    function clipDrawable(rect, b) {
      let pieces = b ? clipRectToFootprint(rect, b.template, b.params) : [rect];
      for (const claimed of existingRectsOnFloor(b)) {
        pieces = applyRectEdit(pieces, claimed, 'erase');
      }
      return pieces;
    }

    const drag = createAreaDrag({
      canvas, camera: cameraParts.camera, floorY: target.y, getBuilding, getMode,
      onPreview: rect => {
        clearPreview();
        showDimLabel(rect);
        if (!rect) return;
        const pieces = clipDrawable(rect, getBuilding());
        if (pieces.length === 0) return;
        previewGroup = createObservationOverlay({ rects: pieces, baseY: target.y, draft: true });
        applyBuildingTransform(previewGroup, getBuilding());
        sceneParts.overlays.add(previewGroup);
      },
      onCommit: (rect, mode) => {
        clearPreview();
        if (!store) return;
        const editingState = store.getState().view.areaEditing;
        if (!editingState) return;
        const b = getBuilding();
        const pieces = mode === 'draw' ? clipDrawable(rect, b) : [rect];
        const rects = pieces.reduce(
          (acc, r) => applyRectEdit(acc, r, mode),
          editingState.rects ?? []
        );
        store.execute(createUpdateAreaEditingCommand({ rects }));
      }
    });
    floorFocus = { slab, existing, drag, tool: editing.tool ?? null, clearPreview, dimLabel };
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
        cameraParts.setEditControls(null);
      }
      return;
    }
    if (!floorFocus || floorFocus.sig !== sig) {
      if (floorFocus) disposeFloorFocus();
      buildFloorFocus(project);
      if (floorFocus) floorFocus.sig = sig;
    } else {
      // A building mesh may have been rebuilt (e.g. revision bump on save),
      // which re-adds it visible. Keep other buildings hidden while focused.
      for (const child of sceneParts.buildings.children) child.visible = false;
      const nextTool = editing.tool ?? null;
      if (floorFocus.tool !== nextTool) {
        floorFocus.tool = nextTool;
        // Re-apply control mode: an active edit tool locks rotation for
        // left-drag drawing; no tool selected unlocks orbiting.
        cameraParts.setEditControls(nextTool);
      }
    }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();

  const _north = new THREE.Vector3();
  const _center = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  function cardinalName(deg) {
    const d = ((deg % 360) + 360) % 360;
    if (d < 22.5 || d >= 337.5) return '正北';
    if (d < 67.5) return '东北';
    if (d < 112.5) return '正东';
    if (d < 157.5) return '东南';
    if (d < 202.5) return '正南';
    if (d < 247.5) return '西南';
    if (d < 292.5) return '正西';
    return '西北';
  }
  function updateCompass() {
    if (!compassNeedle && !compassReadout) return;
    const target = cameraParts.controls.target;
    if (compassNeedle) {
      // Project the target and a point one unit north (+Z) of it to screen
      // space; the resulting screen direction is where the needle must point.
      _center.copy(target).project(cameraParts.camera);
      _north.set(target.x, target.y, target.z + 1).project(cameraParts.camera);
      const dx = _north.x - _center.x;
      const dy = -(_north.y - _center.y); // screen y grows downward
      const angle = Math.atan2(dx, dy) * 180 / Math.PI;
      compassNeedle.style.transform = `rotate(${angle}deg)`;
    }
    if (compassReadout) {
      // Readout = the direction the camera is facing (forward = target - camera).
      _fwd.copy(target).sub(cameraParts.camera.position);
      let deg = Math.atan2(_fwd.x, _fwd.z) * 180 / Math.PI;
      deg = ((deg % 360) + 360) % 360;
      compassReadout.textContent = `${cardinalName(deg)} ${Math.round(deg)}°`;
    }
  }

  rendererParts.renderer.setAnimationLoop(() => {
    cameraParts.controls.update();
    updateOcclusion();
    rendererParts.renderer.render(sceneParts.scene, cameraParts.camera);
    updateCompass();
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
        lit: overlays.area.lit, draft: overlays.area.draft,
        wallHeight: overlays.area.wallHeight ?? 0
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
    enterInterior(payload) { enterInterior(payload); },
    updateInteriorLight(masks) { updateInteriorLight(masks); },
    exitInterior() { exitInterior(); },
    dispose() {
      exitInterior();
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
