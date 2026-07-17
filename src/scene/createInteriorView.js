import * as THREE from 'three';
import { bandTopY, totalBuildingHeight } from '../domain/buildings/floorMath.js';
import { roomInteriorFrame } from '../domain/rooms/roomGeometry.js';
import { createFadeState } from './occlusionFade.js';
import { eachEdge, isBuildingShell, isLidOrAbove, isSegment } from './sceneTags.js';

// 室内视图 (Interior View):进入某个房间内部、观察真实太阳光斑的视图模式。
// 统一几何下"房间就是建筑本体"(CSG 挖好洞的分段网格),进屋只飞相机;墙体
// 始终实心。相机升到天花板以上时把"盖子"(房间上方顶盖 + 更高楼层段)整块
// 隐藏,露出房间内部。此模块独占该功能的完整生命周期与其全部可变状态,使
// 控制器与 main.js 只需转发"当前看几号房间"。
//
// 依赖在构造时一次性注入(照 gizmo 惯例)。射线器为本模块私有 —— 不与拾取/
// 悬停共用,避免此处修改 raycaster.far 时污染它们。
export function createInteriorView({ scene, sunlight, cameraRig, buildingsGroup, raycaster = new THREE.Raycaster() }) {
  const camera = cameraRig.camera;
  // 活动会话:null 表示不在室内视图。进入时置为
  // { buildingId, bandToY, liftY, lid, shadowHalf, center }。
  let interior = null;
  // 被淡化的段网格:mesh → { state, fade, sharedMaterial, sharedEdgeMaterial }。
  const fadeMap = new Map();
  const _occDir = new THREE.Vector3(); // tick 每帧复用,避免分配

  // 聚焦阴影相机到室内房间,让该处阴影纹素密集(边缘锐利)。applySunLighting
  // 每次太阳更新会把光重新对准原点,所以每次太阳更新后都要再调一次。
  function frameShadowsOnInterior() {
    if (!interior) return;
    sunlight.target.position.set(interior.center.x, 0, interior.center.z);
    sunlight.target.updateMatrixWorld();
    const cam = sunlight.shadow.camera;
    const half = interior.shadowHalf;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
    sunlight.shadow.needsUpdate = true;
  }

  function restoreShadowFrame() {
    const cam = sunlight.shadow.camera;
    cam.left = -120; cam.right = 120; cam.top = 120; cam.bottom = -120;
    cam.updateProjectionMatrix();
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.map?.dispose();
    sunlight.shadow.map = null;
    sunlight.shadow.needsUpdate = true;
  }

  // 盖子 = 观察层顶面(bandToY)及以上的东西:顶层房间的独立顶盖 mesh,或
  // 非顶层时上方的整段楼层。楼下段、观察层墙身不在其中,始终可见。
  function lidAndAbove(buildingId, bandToY) {
    const meshes = [];
    for (const child of buildingsGroup.children) {
      if (child.userData?.entityId !== buildingId) continue;
      child.traverse(m => {
        if (isBuildingShell(m) && isLidOrAbove(m, bandToY)) meshes.push(m);
      });
    }
    return meshes;
  }

  function enter(building, room) {
    if (interior) exit();
    const frame = roomInteriorFrame(building, room);
    if (!frame) return;
    const { center, radius } = frame;
    const floor = room.floor;
    const params = building.params;
    const totalH = totalBuildingHeight(params);
    // 房间顶面高度:顶层是屋顶板底,其余层是上一层楼板底(即上方段的 fromY)。
    const bandToY = bandTopY({ floor, ...params });
    // "揭盖"触发高度:相机升到房间中段以上就掀盖。
    const liftY = center.y + params.floorHeight * 0.5;
    const lid = lidAndAbove(building.id, bandToY);

    cameraRig.flyToArea({ center, radius });
    // 视锥必须容纳整栋楼及其阴影投射(低日照时约 2× 楼高) —— 裁掉投射者会在
    // 地面产生尖刺。进入时提高阴影贴图精度补偿(退出时还原)。
    const shadowHalf = Math.max(60, radius * 3, totalH * 1.6);
    sunlight.shadow.mapSize.set(4096, 4096);
    sunlight.shadow.map?.dispose();
    sunlight.shadow.map = null;
    // 调暗天光,让光斑与阴影对比更强。
    const hemi = scene.getObjectByName('ambient-sky');
    if (hemi) hemi.intensity = 0.9;
    interior = {
      buildingId: building.id, bandToY, liftY, lid,
      shadowHalf, center: new THREE.Vector3(center.x, center.y, center.z)
    };
    frameShadowsOnInterior();
  }

  function exit() {
    if (!interior) return;
    for (const mesh of interior.lid) mesh.visible = true;
    for (const [mesh, entry] of fadeMap) {
      mesh.material.dispose();
      mesh.material = entry.sharedMaterial;
      eachEdge(mesh, child => {
        child.material.dispose();
        child.material = entry.sharedEdgeMaterial;
      });
    }
    fadeMap.clear();
    const hemi = scene.getObjectByName('ambient-sky');
    if (hemi) hemi.intensity = 1.5;
    cameraRig.setEditControls(null);
    interior = null;
    restoreShadowFrame();
  }

  // 楼改动会重建段网格,interior.lid 里的旧 mesh 随之失效 → 按最新网格重新
  // 收集"盖子",并立即按当前相机高度决定其可见性。
  function onProjectChange() {
    if (!interior) return;
    const alive = lidAndAbove(interior.buildingId, interior.bandToY);
    const lidSet = new Set(interior.lid);
    if (alive.length !== interior.lid.length || alive.some(m => !lidSet.has(m))) {
      interior.lid = alive;
      const lifted = camera.position.y > interior.liftY;
      for (const mesh of alive) mesh.visible = !lifted;
    }
  }

  function onSolarUpdate() {
    frameShadowsOnInterior();
  }

  // 相机在房间中段以下 → 第一人称(盖子在位);升到以上 → 揭盖,露出房间。
  function tick() {
    if (!interior) return;
    const lifted = camera.position.y > interior.liftY;
    for (const mesh of interior.lid) mesh.visible = !lifted;

    // 聚焦建筑的段 mesh(排除顶盖):射线 相机→房间中心,命中且在中心之前者遮挡。
    const cam = camera.position;
    _occDir.copy(interior.center).sub(cam);
    const distToCenter = _occDir.length();
    _occDir.normalize();
    raycaster.set(cam, _occDir);
    raycaster.far = distToCenter;

    const segments = [];
    for (const child of buildingsGroup.children) {
      if (child.userData?.entityId !== interior.buildingId) continue;
      child.traverse(m => {
        if (isSegment(m) && m.visible) segments.push(m);
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
        eachEdge(mesh, child => {
          entry.sharedEdgeMaterial = child.material;
          child.material = child.material.clone();
          child.material.transparent = true;
        });
        fadeMap.set(mesh, entry);
      }
      entry.fade = entry.state.update(entry.fade, occluding);
      mesh.material.opacity = entry.fade;
      mesh.material.transparent = entry.fade < 1;
      eachEdge(mesh, child => {
        child.material.opacity = entry.fade;
        child.material.transparent = entry.fade < 1;
      });
    }
  }

  return {
    enter,
    exit,
    onProjectChange,
    onSolarUpdate,
    tick,
    dispose: exit,
    get active() { return interior !== null; }
  };
}