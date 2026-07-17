import * as THREE from 'three';
import { createQualitySettings } from '../features/settings/QualitySettings.js';
import { buildAnalysisOverlays } from './analysisOverlays.js';
import { createBuildingMesh } from './buildingMesh.js';
import { createCameraRig } from './createCameraRig.js';
import { applyRectEdit, createRoomDrag } from './roomDrag.js';
import {
  createFloorSlab,
  floorFocusTarget,
  restoreBuildingVisibility,
  setFloorFocusVisibility
} from './floorFocus.js';
import { bandTopY } from '../domain/buildings/floorMath.js';
import { deriveWalls } from '../domain/walls/deriveWalls.js';
import { applyBuildingTransform } from './buildingSceneHelpers.js';
import { createRoomOverlay } from './roomOverlay.js';
import { clipRectToFootprint } from '../domain/buildings/footprintClip.js';
import { rotateLocalToWorld } from '../domain/buildings/wallGeometry.js';
import { createRenderer } from './createRenderer.js';
import { createScene } from './createScene.js';
import { pointerToNdc, resolvePickedEntity } from './picking.js';
import { selectedBuildingId } from '../domain/project/viewSelection.js';
import { applySunLighting } from './sunLighting.js';
import { createSceneSynchronizer } from './syncScene.js';
import { createAppendRoomRectCommand } from '../store/roomCommands.js';
import { createBuildingGestures } from './gizmos/createBuildingGestures.js';
import { createOpeningGestures } from './gizmos/createOpeningGestures.js';
import { createRoomGestures } from './gizmos/createRoomGestures.js';
import { createWallOverlay, wallCameraPose } from './wallOverlay.js';
import { createInteriorView } from './createInteriorView.js';

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
  const buildingGestures = createBuildingGestures({
    canvas,
    camera: cameraParts.camera,
    scene: sceneParts.scene,
    buildingsGroup: sceneParts.buildings,
    store,
    setCameraLocked: locked => cameraParts.setEditControls(locked ? 'draw' : null),
    previewBuilding: building => synchronizer.showTransient(building),
    clearBuildingPreview: () => synchronizer.clearTransient(),
  });
  const openingGestures = createOpeningGestures({
    canvas,
    camera: cameraParts.camera,
    scene: sceneParts.scene,
    store,
    setCameraLocked: locked => cameraParts.setEditControls(locked ? 'draw' : null)
  });

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
    if (buildingGestures.consumeSuppressedClick() || openingGestures.consumeSuppressedClick()) return;
    // While a draw/erase tool is engaged, left clicks draw rather than select.
    // In the room view with no active tool, clicks still select (to pick walls, etc.).
    if (floorFocus?.draft?.tool) return;
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
  let currentProject = null;
  let hoverWallId = null;
  let hoverWallOverlay = null;
  let selectedWallOverlay = null;

  function clearAnalysisOverlays() {
    for (const overlay of sceneParts.overlays.children) {
      overlay.userData?.dispose?.();
    }
    sceneParts.overlays.clear();
  }
  function disposeWallOverlay(overlay) {
    if (!overlay) return;
    sceneParts.scene.remove(overlay);
    overlay.userData.dispose?.();
  }

  function wallContext(selection) {
    if (selection?.kind !== 'wall') return null;
    const building = currentProject?.buildings.find(item => item.id === selection.buildingId);
    const wall = building && deriveWalls(building, selection.floor).find(item => item.id === selection.id);
    return building && wall ? { building, wall } : null;
  }

  function syncSelectedWall(project) {
    disposeWallOverlay(selectedWallOverlay);
    selectedWallOverlay = null;
    const context = wallContext(project.view.selection);
    if (!context) return;
    selectedWallOverlay = createWallOverlay(context.building, context.wall, {
      centerU: project.view.selection.centerU ?? 0.5,
      selected: true
    });
    sceneParts.scene.add(selectedWallOverlay);
  }

  function clearHoverWall() {
    disposeWallOverlay(hoverWallOverlay);
    hoverWallOverlay = null;
    hoverWallId = null;
  }

  function hoverAtPointer(event) {
    const phase = currentProject?.view?.phase;
    if (floorFocus || (phase !== 'building' && phase !== 'room')) {
      clearHoverWall();
      return;
    }
    const ndc = pointerToNdc(event, canvas.getBoundingClientRect());
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, cameraParts.camera);
    const selection = resolvePickedEntity(raycaster.intersectObjects(sceneParts.buildings.children, true));
    if (selection?.kind !== 'wall' || selection.id === currentProject.view.selection?.id) {
      clearHoverWall();
      return;
    }
    if (selection.id === hoverWallId) return;
    clearHoverWall();
    const context = wallContext(selection);
    if (!context) return;
    hoverWallId = selection.id;
    hoverWallOverlay = createWallOverlay(context.building, context.wall);
    sceneParts.scene.add(hoverWallOverlay);
  }

  canvas.addEventListener('pointermove', hoverAtPointer);

  const interiorView = createInteriorView({
    scene: sceneParts.scene,
    sunlight: sceneParts.sunlight,
    cameraRig: cameraParts,
    buildingsGroup: sceneParts.buildings
  });

  function disposeDraft() {
    if (!floorFocus?.draft) return;
    floorFocus.draft.drag?.dispose();
    floorFocus.draft.roomGestures?.dispose();
    floorFocus.clearPreview();
    floorFocus.dimLabel.hidden = true;
    floorFocus.draft = null;
    cameraParts.setEditControls(null);
  }

  function disposeFloorFocus() {
    if (!floorFocus) return;
    disposeDraft();
    const origin = sceneParts.aids.getObjectByName('coordinate-origin');
    if (origin) origin.visible = true;
    floorFocus.clearPreview();
    floorFocus.dimLabel?.remove();
    sceneParts.scene.remove(floorFocus.slab);
    floorFocus.slab.userData.dispose();
    for (const overlay of floorFocus.existing) {
      overlay.userData.dispose();
      sceneParts.scene.remove(overlay);
    }
    floorFocus = null;
    restoreBuildingVisibility(sceneParts.buildings);
  }

  // Rebuild the set of solid overlays for OTHER rooms on this floor. Excludes the
  // room currently being drafted (its working rects live in the session, not the
  // saved building) so the draft doesn't double up with a solid overlay.
  function rebuildExistingOverlays() {
    if (!floorFocus) return;
    for (const overlay of floorFocus.existing) {
      overlay.userData.dispose();
      sceneParts.scene.remove(overlay);
    }
    const building = currentProject?.buildings.find(b => b.id === floorFocus.buildingId);
    const draftRoomId = currentProject?.view?.roomEditing?.roomId ?? null;
    floorFocus.existing = (building?.rooms ?? [])
      .filter(room => room.floor === floorFocus.floor && room.id !== draftRoomId)
      .map(room => {
        const overlay = createRoomOverlay({ rects: room.rects, baseY: floorFocus.baseY, draft: false });
        applyBuildingTransform(overlay, building);
        sceneParts.scene.add(overlay);
        return overlay;
      });
  }

  // The persistent "编辑房间" view: lift the lid on one floor of one building and
  // frame the camera on it. Driven by view.roomFocus — it stays for the whole
  // room-editing view, independent of whether a room is actively being drafted.
  function buildFloorFocus(project) {
    const focus = project.view.roomFocus;
    if (!focus) return;
    const buildingId = focus.buildingId;
    const floor = focus.floor;
    const building = project.buildings.find(b => b.id === buildingId);
    if (!building) return;

    const bandToY = bandTopY({ floor, ...building.params });
    setFloorFocusVisibility(sceneParts.buildings, buildingId, floor, bandToY);
    const origin = sceneParts.aids.getObjectByName('coordinate-origin');
    if (origin) origin.visible = false;

    // Keep the current camera angle when entering; do not snap to top-down.
    // `target.y` is the draw-plane height and overlay baseY.
    const { target } = floorFocusTarget(building, floor);
    cameraParts.focusFloor({
      center: { x: building.position.x, y: target.y, z: building.position.z },
      radius: Math.max(building.params.length, building.params.depth) / 2
    });

    const slab = createFloorSlab(building, floor);
    sceneParts.scene.add(slab);

    // Floating dimension readout shown next to the rect while dragging.
    const dimLabel = document.createElement('div');
    dimLabel.className = 'scene-dim-label';
    dimLabel.hidden = true;
    viewport.appendChild(dimLabel);
    const _dimVec = new THREE.Vector3();
    function showDimLabel(rect) {
      if (!rect) { dimLabel.hidden = true; return; }
      const width = Math.abs(rect.x1 - rect.x0);
      const depth = Math.abs(rect.z1 - rect.z0);
      if (width < 1e-6 && depth < 1e-6) { dimLabel.hidden = true; return; }
      dimLabel.textContent = `${width.toFixed(2)} × ${depth.toFixed(2)} 米`;
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
        previewGroup.userData.dispose();
        sceneParts.overlays.remove(previewGroup);
        previewGroup = null;
      }
    };
    const renderRoomPreview = (rects, valid = true) => {
      clearPreview();
      if (!rects?.length) return;
      previewGroup = createRoomOverlay({
        rects, baseY: target.y, draft: true, invalid: !valid
      });
      applyBuildingTransform(previewGroup, building);
      sceneParts.overlays.add(previewGroup);
    };

    const getBuilding = () => store.getState().buildings.find(b => b.id === buildingId);

    function existingRectsOnFloor(b) {
      const draftRoomId = store.getState().view.roomEditing?.roomId ?? null;
      return (b?.rooms ?? [])
        .filter(room => room.floor === floor && room.id !== draftRoomId)
        .flatMap(a => a.rects ?? []);
    }
    function clipDrawable(rect, b) {
      let pieces = b ? clipRectToFootprint(rect, b.template, b.params) : [rect];
      for (const claimed of existingRectsOnFloor(b)) {
        pieces = applyRectEdit(pieces, claimed, 'erase');
      }
      return pieces;
    }

    floorFocus = {
      buildingId, floor, baseY: target.y,
      sig: `${buildingId}:${floor}`,
      slab, existing: [], dimLabel, clearPreview,
      showDimLabel, renderRoomPreview, clipDrawable, getBuilding,
      draft: null
    };
    rebuildExistingOverlays();
  }

  // Attach/detach the draft sub-state (draw drag + resize gestures + tool). Driven
  // by view.roomEditing — created when a room draft starts, torn down when it ends,
  // while the floor focus (lid) stays put.
  function syncDraft(project) {
    const editing = project.view.roomEditing;
    if (!floorFocus) return;
    if (!editing) {
      if (floorFocus.draft) { disposeDraft(); rebuildExistingOverlays(); }
      return;
    }
    const draftSig = `${editing.roomId}:${editing.mode}`;
    if (floorFocus.draft?.sig === draftSig) {
      if (editing.mode === 'edit') floorFocus.renderRoomPreview(editing.rects);
      return;
    }
    if (floorFocus.draft) disposeDraft();
    rebuildExistingOverlays();

    cameraParts.setEditControls(editing.mode === 'edit' ? null : 'draw');
    if (editing.mode === 'edit') floorFocus.renderRoomPreview(editing.rects);

    const roomGestures = editing.mode === 'edit' && editing.rects?.length
      ? createRoomGestures({
          canvas, camera: cameraParts.camera, scene: sceneParts.scene, store,
          building: floorFocus.getBuilding(), floor: floorFocus.floor,
          floorY: floorFocus.baseY, rects: editing.rects,
          onPreview: floorFocus.renderRoomPreview,
          setCameraLocked: locked => cameraParts.setEditControls(locked ? 'draw' : null)
        })
      : null;

    const getMode = () => editing.mode === 'edit' ? null : (floorFocus?.draft?.tool ?? 'draw');
    const drag = createRoomDrag({
      canvas, camera: cameraParts.camera, floorY: floorFocus.baseY,
      getBuilding: floorFocus.getBuilding, getMode,
      onPreview: rect => {
        floorFocus.clearPreview();
        floorFocus.showDimLabel(rect);
        if (!rect) return;
        const b = floorFocus.getBuilding();
        const pieces = floorFocus.clipDrawable(rect, b);
        if (pieces.length === 0) return;
        floorFocus.renderRoomPreview(pieces);
      },
      onCommit: rect => {
        floorFocus.clearPreview();
        if (!store?.getState()?.view?.roomEditing) return;
        for (const piece of floorFocus.clipDrawable(rect, floorFocus.getBuilding())) {
          store.execute(createAppendRoomRectCommand(piece));
        }
      }
    });
    floorFocus.draft = {
      sig: draftSig, drag, roomGestures,
      tool: editing.mode === 'edit' ? null : 'draw'
    };
  }

  // Reconcile floor-focus lifecycle from the view. The controller owns its own
  // diffing (like syncScene does for meshes) so main.js just calls this
  // unconditionally on every project change.
  function syncFloorFocus(project) {
    const focus = project.view.roomFocus;
    const sig = focus ? `${focus.buildingId}:${focus.floor}` : '';
    if (!focus) {
      if (floorFocus) disposeFloorFocus();
      return;
    }
    if (!floorFocus || floorFocus.sig !== sig) {
      if (floorFocus) disposeFloorFocus();
      buildFloorFocus(project);
    } else {
      const building = project.buildings.find(item => item.id === focus.buildingId);
      if (building) {
        const bandToY = bandTopY({ floor: focus.floor, ...building.params });
        setFloorFocusVisibility(sceneParts.buildings, focus.buildingId, focus.floor, bandToY);
      }
    }
    syncDraft(project);
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
    buildingGestures.updateOverlay();
    interiorView.tick();
    rendererParts.renderer.render(sceneParts.scene, cameraParts.camera);
    updateCompass();
  });

  return {
    updateProject(project) {
      currentProject = project;
      const highlightBuildingId = selectedBuildingId(project.view);
      synchronizer.update(project.buildings, { highlightBuildingId });
      buildingGestures.updateProject(project);
      openingGestures.updateProject(project);
      syncSelectedWall(project);
      // revision 变化会重建段网格 → 室内视图按最新网格重新收集"盖子"。
      interiorView.onProjectChange(project);
      canvas.dataset.buildingCount = String(project.buildings.length);
    },
    updateSolar(simulationState, phase = 'present') {
      applySunLighting(sceneParts.sunlight, simulationState.solar, { phase });
      interiorView.onSolarUpdate();
      const direction = simulationState.solar.direction;
      canvas.dataset.sunDirection = [direction.x, direction.y, direction.z]
        .map(value => value.toFixed(4))
        .join(',');
      canvas.dataset.sunAboveHorizon = String(simulationState.solar.aboveHorizon);
    },
    updateAnalysis(project, simulationState, phase = 'present') {
      clearAnalysisOverlays();
      const overlays = buildAnalysisOverlays(project, simulationState, phase);
      if (!overlays) return;
      const roomGroup = createRoomOverlay({
        rects: overlays.room.rects, baseY: overlays.room.baseY,
        lit: overlays.room.lit, draft: overlays.room.draft,
        wallHeight: overlays.room.wallHeight ?? 0
      });
      roomGroup.position.set(overlays.room.group.position.x, 0, overlays.room.group.position.z);
      roomGroup.rotation.y = THREE.MathUtils.degToRad(overlays.room.group.rotationDeg);
      sceneParts.overlays.add(roomGroup);
    },
    setPreviewing(value) {
      quality.setPreviewing(value);
      resize();
    },
    syncFloorFocus(project) {
      syncFloorFocus(project);
    },
    faceWall(selection) {
      const context = wallContext({ kind: 'wall', id: selection.wallId, ...selection });
      if (!context) return false;
      cameraParts.focusWall(wallCameraPose(context.building, context.wall));
      return true;
    },
    enterInterior(building, room) { interiorView.enter(building, room); },
    exitInterior() { interiorView.exit(); },
    dispose() {
      interiorView.dispose();
      canvas.removeEventListener('click', selectAtPointer);
      canvas.removeEventListener('pointermove', hoverAtPointer);
      buildingGestures.dispose();
      openingGestures.dispose();
      clearHoverWall();
      disposeWallOverlay(selectedWallOverlay);
      observer.disconnect();
      rendererParts.renderer.setAnimationLoop(null);
      synchronizer.dispose();
      clearAnalysisOverlays();
      cameraParts.dispose();
      rendererParts.dispose();
    }
  };
}
