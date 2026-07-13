import * as THREE from 'three';
import { createQualitySettings } from '../features/settings/QualitySettings.js';
import { buildAnalysisOverlays } from './analysisOverlays.js';
import { createBuildingMesh } from './buildingMesh.js';
import { createCameraRig } from './createCameraRig.js';
import { applyRectEdit, createAreaDrag } from './areaDrag.js';
import { createFloorSlab, floorFocusTarget } from './floorFocus.js';
import { floorBaseY, totalBuildingHeight } from '../domain/buildings/floorMath.js';
import { SLAB_THICKNESS } from '../domain/buildings/segmentBuilding.js';
import { applyBuildingTransform } from './buildingSceneHelpers.js';
import { createObservationOverlay } from './observationOverlay.js';
import { clipRectToFootprint } from '../domain/buildings/footprintClip.js';
import { rotateLocalToWorld } from '../domain/buildings/wallGeometry.js';
import { createRenderer } from './createRenderer.js';
import { createScene } from './createScene.js';
import { pointerToNdc, resolvePickedEntity } from './picking.js';
import { deriveScenePreview } from './scenePreview.js';
import { applySunLighting } from './sunLighting.js';
import { createSceneSynchronizer } from './syncScene.js';
import { createUpdateAreaEditingCommand } from '../store/buildingCommands.js';
import { createFadeState } from './occlusionFade.js';

// 段 mesh 的描边线是它的 'segment-edges' 子对象;淡化/还原时要连着一起改。
function forEachEdge(mesh, fn) {
  for (const child of mesh.children) {
    if (child.userData?.kind === 'segment-edges') fn(child);
  }
}

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
  // 观察视角下被淡化的段网格:mesh → { state, fade, sharedMaterial,
  // sharedEdgeMaterial }。仅登记 building-segment(building-lid 归揭盖管)。
  const fadeMap = new Map();
  const _occDir = new THREE.Vector3(); // updateOcclusion 每帧复用,避免分配

  // The room is the building itself — openings are cut in the geometry so the
  // scene's real sun light + shadow map pours in physically. No mesh is hidden.
  // Focus the sun's shadow camera on the interior room so shadow texels are
  // dense there (crisp edges); applySunLighting re-targets the light at the
  // origin every solar update, so this runs after each of those too.
  function frameShadowsOnInterior() {
    if (!interior) return;
    const light = sceneParts.sunlight;
    light.target.position.set(interior.center.x, 0, interior.center.z);
    light.target.updateMatrixWorld();
    const cam = light.shadow.camera;
    const half = interior.shadowHalf;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
  }

  function restoreShadowFrame() {
    const light = sceneParts.sunlight;
    const cam = light.shadow.camera;
    cam.left = -120; cam.right = 120; cam.top = 120; cam.bottom = -120;
    cam.updateProjectionMatrix();
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.needsUpdate = true;
  }

  // 统一几何:房间就是建筑本体(CSG 挖好洞/掏好空腔的分段网格)。进入室内
  // 只飞入相机;墙体始终实心可见。相机升到天花板以上时,把"盖子"(房间上方
  // 的顶盖 mesh + 所有更高的楼层段)整块隐藏 —— 单块 mesh 的 visible 开关,
  // 没有淡出/背面剔除/剖切那些和实心网格较劲的毛病。
  //
  // 盖子 = 观察层顶面(bandToY)及以上的东西:顶层房间的独立顶盖 mesh,或
  // 非顶层时上方的整段楼层。楼下段、观察层墙身不在其中,始终可见。
  function lidAndAbove(buildingId, bandToY) {
    const meshes = [];
    for (const child of sceneParts.buildings.children) {
      if (child.userData?.entityId !== buildingId) continue;
      child.traverse(m => {
        const kind = m.userData?.kind;
        if (kind !== 'building-segment' && kind !== 'building-lid') return;
        // 顶盖(fromY≈bandToY-SLAB)与上方段(fromY≈bandToY)都归"盖子";
        // 观察层墙身 fromY < bandToY,楼下段更低,都留下。
        if (m.userData.fromY > bandToY - SLAB_THICKNESS - 0.01) meshes.push(m);
      });
    }
    return meshes;
  }

  function enterInterior({ building, floor, area, center, radius }) {
    if (interior) exitInterior();
    fadeMap.clear();
    const params = building.params;
    const totalH = totalBuildingHeight(params);
    // 房间顶面高度:顶层是屋顶板底,其余层是上一层楼板底(即上方段的 fromY)。
    const bandToY = floor >= params.floors ? totalH : floorBaseY({ floor: floor + 1, ...params });
    // "揭盖"触发高度:相机升到房间中段以上就掀盖(轨道很容易到,且此时视线
    // 确实在往房间里俯瞰);低于此为第一人称,盖子回位。
    const liftY = center.y + params.floorHeight * 0.5;
    const lid = lidAndAbove(building.id, bandToY);

    cameraParts.flyToArea({ center, radius });
    // The frustum must contain the whole building AND its shadow throw (a 99m
    // tower at low sun throws ~2× its height) — clipping the caster produces
    // spike artifacts on the ground. Precision is recovered by raising the map
    // size while inside (restored on exit).
    const shadowHalf = Math.max(60, radius * 3, totalH * 1.6);
    const light = sceneParts.sunlight;
    light.shadow.mapSize.set(4096, 4096);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    // Dim the sky ambient so sun patches vs shadow read with more contrast.
    const hemi = sceneParts.scene.getObjectByName('ambient-sky');
    if (hemi) hemi.intensity = 0.9;
    interior = {
      buildingId: building.id, bandToY, liftY, lid,
      shadowHalf, center: new THREE.Vector3(center.x, center.y, center.z)
    };
    frameShadowsOnInterior();
  }

  function exitInterior() {
    if (!interior) return;
    for (const mesh of interior.lid) mesh.visible = true;
    for (const [mesh, entry] of fadeMap) {
      mesh.material.dispose();
      mesh.material = entry.sharedMaterial;
      forEachEdge(mesh, child => {
        child.material.dispose();
        child.material = entry.sharedEdgeMaterial;
      });
    }
    fadeMap.clear();
    const hemi = sceneParts.scene.getObjectByName('ambient-sky');
    if (hemi) hemi.intensity = 1.5;
    cameraParts.setEditControls(null);
    interior = null;
    restoreShadowFrame();
  }

  // 相机在房间中段以下 → 第一人称(盖子在位,四周墙+天花板完整);升到以上
  // → 揭盖:顶盖与上方楼层整块隐藏,露出房间地板与墙,看清光斑分布。
  function updateOcclusion() {
    if (!interior) return;
    const lifted = cameraParts.camera.position.y > interior.liftY;
    for (const mesh of interior.lid) mesh.visible = !lifted;

    // 聚焦建筑的段 mesh(排除顶盖):射线 相机→房间中心,命中且在中心之前者遮挡。
    const cam = cameraParts.camera.position;
    _occDir.copy(interior.center).sub(cam);
    const distToCenter = _occDir.length();
    _occDir.normalize();
    raycaster.set(cam, _occDir);
    raycaster.far = distToCenter;

    const segments = [];
    for (const child of sceneParts.buildings.children) {
      if (child.userData?.entityId !== interior.buildingId) continue;
      child.traverse(m => {
        if (m.userData?.kind === 'building-segment' && m.visible) segments.push(m);
      });
    }
    const segmentSet = new Set(segments);
    const hits = raycaster.intersectObjects(segments, false);
    const occluders = new Set(hits.map(h => h.object));

    // 已登记但本帧不再存在的 mesh(段重建)从表中移除,不再触碰。
    for (const mesh of fadeMap.keys()) {
      if (!segmentSet.has(mesh)) fadeMap.delete(mesh);
    }

    for (const mesh of segments) {
      const occluding = occluders.has(mesh);
      let entry = fadeMap.get(mesh);
      if (!entry) {
        if (!occluding) continue; // 未遮挡且未登记:保持共享实心材质,不克隆
        entry = {
          state: createFadeState(), fade: 1.0,
          sharedMaterial: mesh.material, sharedEdgeMaterial: null
        };
        mesh.material = mesh.material.clone();
        mesh.material.transparent = true;
        forEachEdge(mesh, child => {
          entry.sharedEdgeMaterial = child.material;
          child.material = child.material.clone();
          child.material.transparent = true;
        });
        fadeMap.set(mesh, entry);
      }
      entry.fade = entry.state.update(entry.fade, occluding);
      mesh.material.opacity = entry.fade;
      mesh.material.transparent = entry.fade < 1;
      forEachEdge(mesh, child => {
        child.material.opacity = entry.fade;
        child.material.transparent = entry.fade < 1;
      });
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
      // revision 变化会重建段网格,interior.lid 里的旧 mesh 随之失效 →
      // 按最新网格重新收集"盖子",并立即按当前相机高度决定其可见性。
      if (interior) {
        const alive = lidAndAbove(interior.buildingId, interior.bandToY);
        const lidSet = new Set(interior.lid);
        if (alive.length !== interior.lid.length || alive.some(m => !lidSet.has(m))) {
          interior.lid = alive;
          const lifted = cameraParts.camera.position.y > interior.liftY;
          for (const mesh of alive) mesh.visible = !lifted;
        }
      }
      canvas.dataset.buildingCount = String(project.buildings.length);
      canvas.dataset.previewBuildingId = previewBuildingId ?? '';
    },
    updateSolar(simulationState, phase = 'present') {
      applySunLighting(sceneParts.sunlight, simulationState.solar, { phase });
      frameShadowsOnInterior();
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
    },
    setPreviewing(value) {
      quality.setPreviewing(value);
      resize();
    },
    syncFloorFocus(project) {
      syncFloorFocus(project);
    },
    enterInterior(payload) { enterInterior(payload); },
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
