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
import { selectedBuildingId } from './sceneSelection.js';
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
    if (floorFocus || currentProject?.view?.phase !== 'build') {
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

  function disposeFloorFocus() {
    if (!floorFocus) return;
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
    floorFocus.drag.dispose();
    floorFocus.roomGestures?.dispose();
    floorFocus = null;
    restoreBuildingVisibility(sceneParts.buildings);
  }

  function buildFloorFocus(project) {
    const editing = project.view.roomEditing;
    if (!editing) return;
    const buildingId = editing.buildingId;
    const floor = editing.floor;
    const building = project.buildings.find(b => b.id === buildingId);
    if (!building) return;

    const bandToY = bandTopY({ floor, ...building.params });
    setFloorFocusVisibility(sceneParts.buildings, buildingId, floor, bandToY);
    const origin = sceneParts.aids.getObjectByName('coordinate-origin');
    if (origin) origin.visible = false;

    // Keep the current camera angle when entering room editing; do not snap to
    // top-down. `target` is still used for the draw plane height and overlay
    // baseY. The user can orbit freely (view mode) until they pick a tool.
    const { target } = floorFocusTarget(building, floor);
    cameraParts.focusFloor({
      center: { x: building.position.x, y: target.y, z: building.position.z },
      radius: Math.max(building.params.length, building.params.depth) / 2
    });
    cameraParts.setEditControls(editing.mode === 'edit' ? null : 'draw');

    const slab = createFloorSlab(building, floor);
    sceneParts.scene.add(slab);

    // Show this floor's other observation areas (already saved) as solid
    // overlays so the user can see existing rooms while drawing a new one.
    const existing = (building.rooms ?? [])
      .filter(room => room.floor === floor && room.id !== editing.roomId)
      .map(a => {
        const overlay = createRoomOverlay({ rects: a.rects, baseY: target.y, draft: false });
        applyBuildingTransform(overlay, building);
        sceneParts.scene.add(overlay);
        return overlay;
      });

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
    if (editing.mode === 'edit') renderRoomPreview(editing.rects);

    const roomGestures = editing.mode === 'edit' && editing.rects?.length
      ? createRoomGestures({
          canvas, camera: cameraParts.camera, scene: sceneParts.scene, store,
          building, floor, floorY: target.y, rects: editing.rects,
          onPreview: renderRoomPreview,
          setCameraLocked: locked => cameraParts.setEditControls(locked ? 'draw' : null)
        })
      : null;

    const getBuilding = () => store.getState().buildings.find(b => b.id === buildingId);
    const getMode = () => editing.mode === 'edit' ? null : floorFocus?.tool;

    // Rects already claimed by other rooms on this floor. A new draw must not
    // overlap them. The room being edited is excluded because its
    // working rects live in the session, not in the saved building.
    function existingRectsOnFloor(b) {
      return (b?.rooms ?? [])
        .filter(room => room.floor === editing.floor && room.id !== editing.roomId)
        .flatMap(a => a.rects ?? []);
    }
    function clipDrawable(rect, b) {
      let pieces = b ? clipRectToFootprint(rect, b.template, b.params) : [rect];
      for (const claimed of existingRectsOnFloor(b)) {
        pieces = applyRectEdit(pieces, claimed, 'erase');
      }
      return pieces;
    }

    const drag = createRoomDrag({
      canvas, camera: cameraParts.camera, floorY: target.y, getBuilding, getMode,
      onPreview: rect => {
        clearPreview();
        showDimLabel(rect);
        if (!rect) return;
        const pieces = clipDrawable(rect, getBuilding());
        if (pieces.length === 0) return;
        previewGroup = createRoomOverlay({ rects: pieces, baseY: target.y, draft: true });
        applyBuildingTransform(previewGroup, getBuilding());
        sceneParts.overlays.add(previewGroup);
      },
      onCommit: rect => {
        clearPreview();
        if (!store?.getState()?.view?.roomEditing) return;
        for (const piece of clipDrawable(rect, getBuilding())) {
          store.execute(createAppendRoomRectCommand(piece));
        }
      }
    });
    floorFocus = {
      slab, existing, drag, roomGestures, sig: `${buildingId}:${floor}`,
      tool: editing.mode === 'edit' ? null : 'draw', clearPreview, dimLabel
    };
  }

  // Reconcile floor-focus lifecycle from the editing session. The controller owns
  // its own diffing (like syncScene does for meshes) so main.js just calls this
  // unconditionally on every project change.
  function syncFloorFocus(project) {
    const editing = project.view.roomEditing;
    const sig = editing ? `${editing.buildingId}:${editing.floor}` : '';
    if (!editing) {
      if (floorFocus) {
        // disposeFloorFocus already restores building visibility.
        disposeFloorFocus();
        cameraParts.setEditControls(null);
      }
      return;
    }
    if (!floorFocus || floorFocus.sig !== sig) {
      if (floorFocus) disposeFloorFocus();
      buildFloorFocus(project);
    } else {
      const building = project.buildings.find(item => item.id === editing.buildingId);
      if (building) {
        const bandToY = bandTopY({ floor: editing.floor, ...building.params });
        setFloorFocusVisibility(sceneParts.buildings, editing.buildingId, editing.floor, bandToY);
      }
      const nextTool = editing.mode === 'edit' ? null : 'draw';
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
