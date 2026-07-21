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
import { applyCeiling } from './ceilingVisibility.js';
import { bandTopY } from '../domain/buildings/floorMath.js';
import { deriveWalls } from '../domain/walls/deriveWalls.js';
import { applyBuildingTransform } from './buildingSceneHelpers.js';
import { createRoomOverlay } from './roomOverlay.js';
import { clipRectToFootprint } from '../domain/buildings/footprintClip.js';
import { rotateLocalToWorld } from '../domain/buildings/wallGeometry.js';
import { createRenderer } from './createRenderer.js';
import { createScene } from './createScene.js';
import { pointerToNdc, resolvePickedEntity } from './picking.js';
import { selectedBuildingId, isDrawingToolActive } from '../domain/project/viewSelection.js';
import { applySunLighting } from './sunLighting.js';
import { createSceneSynchronizer } from './syncScene.js';
import { createAppendRoomRectCommand, createEraseRoomRectCommand } from '../store/roomCommands.js';
import { showToast } from '../ui/Toast.js';
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
    // A camera orbit/pan ends with a browser 'click'; ignore it so dragging the
    // view never counts as picking an entity (which in sunlight phase would snap
    // back to the exterior).
    if (pointerDragged) return;
    // While a draw/erase tool is engaged, left clicks draw rather than select.
    // In the room view with no active tool (select), clicks still select — e.g.
    // to pick a wall for adding an opening.
    if (isDrawingToolActive(currentProject?.view)) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = pointerToNdc(event, rect);
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, cameraParts.camera);
    const intersections = raycaster.intersectObjects(sceneParts.buildings.children, true);
    const entityId = resolvePickedEntity(intersections);
    if (entityId) onSelect(entityId);
  }

  // Distinguish a click from a drag (orbit/pan): if the pointer moved beyond a
  // few pixels between down and up, the trailing 'click' is suppressed.
  const CLICK_DRAG_THRESHOLD = 6;
  let pointerDownPos = null;
  let pointerDragged = false;
  const onPointerDownTrack = event => {
    pointerDownPos = { x: event.clientX, y: event.clientY };
    pointerDragged = false;
  };
  const onPointerMoveTrack = event => {
    if (!pointerDownPos) return;
    if (Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y) > CLICK_DRAG_THRESHOLD) {
      pointerDragged = true;
    }
  };
  const onPointerUpTrack = () => { pointerDownPos = null; };
  canvas.addEventListener('pointerdown', onPointerDownTrack);
  canvas.addEventListener('pointermove', onPointerMoveTrack);
  window.addEventListener('pointerup', onPointerUpTrack);

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
    // 墙面高亮(为开窗/开门做准备)只在"编辑房间"相;编辑建筑相不响应墙。
    if (floorFocus || currentProject?.view?.phase !== 'room') {
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
    // 还原天花:若离开前处于半透明/隐藏,必须解除克隆材质并复位,否则楼顶会
    // 一直挂着半透明(restoreBuildingVisibility 只翻 visible,不碰材质)。
    if (floorFocus.floor != null) {
      const building = currentProject?.buildings.find(b => b.id === floorFocus.buildingId);
      if (building) {
        const group = sceneParts.buildings.children.find(c => c.userData?.entityId === floorFocus.buildingId);
        if (group) applyCeiling(group, bandTopY({ floor: floorFocus.floor, ...building.params }), 'show');
      }
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

  // 有效天花档:画/擦工具激活时强制"隐藏"(掀掉上方楼层),让贴在本层顶面的预览
  // 不被上层楼挡;否则用用户选的 view.ceiling。
  const effectiveCeiling = view => isDrawingToolActive(view) ? 'hide' : view.ceiling;

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
    setFloorFocusVisibility(sceneParts.buildings, buildingId, floor, bandToY, effectiveCeiling(project.view));
    const origin = sceneParts.aids.getObjectByName('coordinate-origin');
    if (origin) origin.visible = false;

    // Keep the current camera angle when entering; do not snap to top-down.
    // `target.y` is the draw-plane height and overlay baseY.
    const { target } = floorFocusTarget(building, floor);
    // 预览贴在本层顶面(bandTop);拾取平面仍在本层地面(target.y),XZ 坐标即房间坐标。
    const previewY = bandTopY({ floor, ...building.params });
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
      _dimVec.set(wx + (b?.position.x ?? 0), previewY, wz + (b?.position.z ?? 0));
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
        sceneParts.drafts.remove(previewGroup);
        previewGroup = null;
      }
    };
    const renderRoomPreview = (rects, valid = true) => {
      clearPreview();
      if (!rects?.length) return;
      // 预览贴在当前层"顶面"(bandTop)——朝上的面,斜俯不被本层墙挡;配合绘制时
      // 掀掉上方楼层,预览始终可见,位置真实(所见即所得)。
      previewGroup = createRoomOverlay({
        rects, baseY: previewY, draft: true, invalid: !valid
      });
      applyBuildingTransform(previewGroup, building);
      sceneParts.drafts.add(previewGroup);
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
      buildingRevision: building.revision,
      ceiling: effectiveCeiling(project.view),
      slab, existing: [], dimLabel, clearPreview,
      showDimLabel, renderRoomPreview, clipDrawable, getBuilding,
      draft: null
    };
    rebuildExistingOverlays();
  }

  // Attach/detach the draft sub-state (draw drag + resize gestures) driven by
  // view.roomEditing (its lifecycle) and view.roomTool (left-button behaviour).
  // The draw drag reads the tool live via getMode, so switching tools only needs
  // to re-apply camera controls and add/remove the edit-mode resize gestures —
  // never a geometry/overlay rebuild.
  function syncDraft(project) {
    const editing = project.view.roomEditing;
    if (!floorFocus) return;
    if (!editing) {
      if (floorFocus.draft) { disposeDraft(); rebuildExistingOverlays(); }
      return;
    }
    const active = isDrawingToolActive(project.view); // draw/erase reserve the left button
    const draftSig = `${editing.roomId}:${editing.mode}`;
    if (floorFocus.draft?.sig === draftSig) {
      // Refresh the edit-mode preview only when the rects actually changed
      // (new array reference per edit command), not on every store notification.
      if (editing.mode === 'edit' && floorFocus.draft.rects !== editing.rects) {
        floorFocus.draft.rects = editing.rects;
        floorFocus.renderRoomPreview(editing.rects);
      }
      syncDraftTool(active);
      return;
    }
    if (floorFocus.draft) disposeDraft();
    rebuildExistingOverlays();
    if (editing.mode === 'edit') floorFocus.renderRoomPreview(editing.rects);

    const getMode = () => {
      const t = store.getState().view.roomTool;
      return t === 'draw' || t === 'erase' ? t : null;
    };
    const drag = createRoomDrag({
      canvas, camera: cameraParts.camera, floorY: floorFocus.baseY,
      getBuilding: floorFocus.getBuilding, getMode,
      onPreview: rect => {
        floorFocus.clearPreview();
        floorFocus.showDimLabel(rect);
        if (!rect) return;
        if (getMode() === 'erase') {
          // Preview the cut region itself, flagged invalid (it's being removed).
          floorFocus.renderRoomPreview([rect], false);
          return;
        }
        const b = floorFocus.getBuilding();
        const pieces = floorFocus.clipDrawable(rect, b);
        // 有可落地部分就预览裁剪后的真实形状;完全落在footprint外或压在已有房间上
        // (裁成空)则把原始拖拽矩形标红预览,让用户始终看得到自己在画什么。
        if (pieces.length > 0) floorFocus.renderRoomPreview(pieces);
        else floorFocus.renderRoomPreview([rect], false);
      },
      onCommit: (rect, mode) => {
        floorFocus.clearPreview();
        if (!store?.getState()?.view?.roomEditing) return;
        if (mode === 'erase') {
          if (!store.execute(createEraseRoomRectCommand(rect))) {
            showToast('不能这么做:擦除会把房间断成两块', 'error');
          }
          return;
        }
        for (const piece of floorFocus.clipDrawable(rect, floorFocus.getBuilding())) {
          store.execute(createAppendRoomRectCommand(piece));
        }
      }
    });
    floorFocus.draft = {
      sig: draftSig, drag, roomGestures: null, active: null,
      rects: editing.mode === 'edit' ? editing.rects : null
    };
    syncDraftTool(active);
  }

  // Reconcile only the tool-dependent bits of a live draft: camera controls
  // (draw/erase lock rotation for left-drag; select orbits) and the edit-mode
  // resize gestures (present only in select mode). Cheap — no overlay rebuild.
  function syncDraftTool(active) {
    const draft = floorFocus?.draft;
    if (!draft || draft.active === active) return;
    draft.active = active;
    cameraParts.setEditControls(active ? 'draw' : null);
    const editing = currentProject?.view?.roomEditing;
    const wantGestures = editing?.mode === 'edit' && !active && editing.rects?.length;
    if (wantGestures && !draft.roomGestures) {
      draft.roomGestures = createRoomGestures({
        canvas, camera: cameraParts.camera, scene: sceneParts.scene, store,
        building: floorFocus.getBuilding(), floor: floorFocus.floor,
        floorY: floorFocus.baseY, rects: editing.rects,
        onPreview: floorFocus.renderRoomPreview,
        setCameraLocked: locked => cameraParts.setEditControls(locked ? 'draw' : null)
      });
    } else if (!wantGestures && draft.roomGestures) {
      draft.roomGestures.dispose();
      draft.roomGestures = null;
    }
  }

  // Reconcile floor-focus lifecycle from the view. The controller owns its own
  // diffing (like syncScene does for meshes) so main.js just calls this
  // unconditionally on every project change.
  function syncFloorFocus(project) {
    const focus = project.view.roomFocus;
    // roomFocus.floor 为 null = 编辑房间相但"未选层":整栋实心显示,不掀盖、不画。
    const hasFloor = focus && focus.floor != null;
    const sig = hasFloor ? `${focus.buildingId}:${focus.floor}` : '';
    if (!hasFloor) {
      if (floorFocus) disposeFloorFocus();
      return;
    }
    if (!floorFocus || floorFocus.sig !== sig) {
      if (floorFocus) disposeFloorFocus();
      buildFloorFocus(project);
    } else {
      // Re-apply the lid visibility when the focused building's meshes were
      // rebuilt (revision bump resets mesh.visible) or the ceiling mode changed.
      const building = project.buildings.find(item => item.id === focus.buildingId);
      const ceiling = effectiveCeiling(project.view);
      if (building && (building.revision !== floorFocus.buildingRevision || ceiling !== floorFocus.ceiling)) {
        floorFocus.buildingRevision = building.revision;
        floorFocus.ceiling = ceiling;
        const bandToY = bandTopY({ floor: focus.floor, ...building.params });
        setFloorFocusVisibility(sceneParts.buildings, focus.buildingId, focus.floor, bandToY, ceiling);
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
      // revision 变化会重建段网格 → 室内视图按最新网格重新应用天花档;天花档本身
      // 变化(view.ceiling)也在此推给室内视图,与编辑房间共用同一状态。
      interiorView.onProjectChange();
      interiorView.setCeiling(project.view.ceiling);
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
    enterInterior(building, room, ceiling = 'hide') { interiorView.enter(building, room, ceiling); },
    exitInterior() { interiorView.exit(); },
    dispose() {
      interiorView.dispose();
      canvas.removeEventListener('click', selectAtPointer);
      canvas.removeEventListener('pointerdown', onPointerDownTrack);
      canvas.removeEventListener('pointermove', onPointerMoveTrack);
      window.removeEventListener('pointerup', onPointerUpTrack);
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
