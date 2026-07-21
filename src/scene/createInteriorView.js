import * as THREE from 'three';
import { bandTopY, totalBuildingHeight } from '../domain/buildings/floorMath.js';
import { roomInteriorFrame } from '../domain/rooms/roomGeometry.js';
import { applyCeiling } from './ceilingVisibility.js';

// 室内视图 (Interior View):进入某个房间内部、观察真实太阳光斑的视图模式。
// 统一几何下"房间就是建筑本体"(CSG 挖好洞的分段网格),进屋只飞相机;墙体
// 始终实心。相机升到天花板以上时把"盖子"(房间上方顶盖 + 更高楼层段)整块
// 隐藏,露出房间内部。此模块独占该功能的完整生命周期与其全部可变状态,使
// 控制器与 main.js 只需转发"当前看几号房间"。
//
// 依赖在构造时一次性注入(照 gizmo 惯例)。
export function createInteriorView({ scene, sunlight, cameraRig, buildingsGroup }) {
  // 活动会话:null 表示不在室内视图。进入时置为
  // { buildingId, bandToY, ceiling, shadowHalf, center }。
  let interior = null;

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

  function buildingGroupOf(buildingId) {
    return buildingsGroup.children.find(child => child.userData?.entityId === buildingId) ?? null;
  }

  // 按当前天花档(view.ceiling)显隐本房间的盖子。与编辑房间共用 applyCeiling —
  // 显示/半透明/隐藏,不再随相机高度自动揭盖。
  function applyCeilingNow() {
    if (!interior) return;
    const group = buildingGroupOf(interior.buildingId);
    if (group) applyCeiling(group, interior.bandToY, interior.ceiling);
  }

  function enter(building, room, ceiling = 'hide') {
    if (interior) exit();
    const frame = roomInteriorFrame(building, room);
    if (!frame) return;
    const { center, radius } = frame;
    const floor = room.floor;
    const params = building.params;
    const totalH = totalBuildingHeight(params);
    // 房间顶面高度:顶层是屋顶板底,其余层是上一层楼板底(即上方段的 fromY)。
    const bandToY = bandTopY({ floor, ...params });

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
      buildingId: building.id, bandToY, ceiling,
      shadowHalf, center: new THREE.Vector3(center.x, center.y, center.z)
    };
    applyCeilingNow();
    frameShadowsOnInterior();
  }

  // 天花档切换:两视图共享全局 view.ceiling,采光视图收到新值即重新应用。
  function setCeiling(ceiling) {
    if (!interior || interior.ceiling === ceiling) return;
    interior.ceiling = ceiling;
    applyCeilingNow();
  }

  function exit() {
    if (!interior) return;
    // 还原盖子(把 hide/ghost 恢复成完整可见的实心外观)。
    const group = buildingGroupOf(interior.buildingId);
    if (group) applyCeiling(group, interior.bandToY, 'show');
    const hemi = scene.getObjectByName('ambient-sky');
    if (hemi) hemi.intensity = 1.5;
    cameraRig.setEditControls(null);
    interior = null;
    restoreShadowFrame();
  }

  // 楼改动会重建段网格 → 重建后按当前天花档重新应用显隐。
  function onProjectChange() {
    applyCeilingNow();
  }

  function onSolarUpdate() {
    frameShadowsOnInterior();
  }

  // 盖子(天花)现在完全由 view.ceiling 手动档静态控制;进入取景后每帧无需再做
  // 任何遮挡/淡化处理。保留空 tick 以兼容动画循环的调用。
  function tick() {}

  return {
    enter,
    exit,
    setCeiling,
    onProjectChange,
    onSolarUpdate,
    tick,
    dispose: exit,
    get active() { return interior !== null; }
  };
}