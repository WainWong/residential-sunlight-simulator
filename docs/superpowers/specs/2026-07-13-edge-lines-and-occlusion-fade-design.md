# 去掉三角剖分斜线 + 观察视角遮挡墙半透明

日期：2026-07-13
分支：feat/unified-geometry

## 背景

统一几何（CSG 挖洞/掏房间的分段实体）落地后，出现两个观感问题：

1. 段网格的描边上出现从某点放射的斜线 —— 那是三角剖分的内部对角线，不代表任何真实结构。
2. 观察视角下，从建筑外侧环绕看房间时，外墙完全实心挡住视线，看不进房间；用户希望挡视线的墙变半透明而不是靠「揭盖」俯瞰。

## 目标

- 段/顶盖描边只保留真实硬棱（转角、墙厚、洞口边），去掉三角化对角线。
- 观察视角（`interior != null`）下，挡在相机与房间中心之间的段墙淡到 ~30% 不透明度；不挡时恢复实心。

## 非目标

- 不改「揭盖」：相机升到 `liftY` 以上时顶盖 + 上方楼层仍整块硬隐藏。
- 不做逐面（单堵墙）淡化 —— 统一几何下一个段的四面外墙是同一块 mesh，最小可控单位是「射线穿过的整段 mesh」。
- 不改 domain 层几何生成。

## 第一部分：去掉三角剖分斜线

### 成因

`src/scene/buildSegmentMeshes.js` 的 `edgesFor()` 把 CSG/`ExtrudeGeometry` 输出直接交给
`new THREE.EdgesGeometry(geometry, 25)`。这些几何含未合并的重复顶点，`EdgesGeometry` 无法
配对共享同一条内部边的两个三角形，判断不出它们共面，于是把每条三角化对角线都当硬边画出。

### 修复

提取边线前先用 `mergeVertices` 焊接顶点：

```js
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function edgesFor(geometry) {
  const welded = mergeVertices(geometry);
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(welded, 25), edgeMaterial);
  welded.dispose();
  lines.userData.kind = 'segment-edges';
  return lines;
}
```

焊接后相邻共面三角形能被配对，其夹角 0° < 25° 阈值被剔除；真实硬棱（转角、墙厚、洞口边）
夹角远大于 25°，保留。`thresholdAngle` 维持 25，不动。仅影响描边 LineSegments，实心 mesh 不变。

### 验证

- 浏览器里进观察视角，顶面/屋顶不再有放射状斜线；转角、洞口、墙厚轮廓仍在。
- 单测（若有 scene-sync/几何相关）与 `npm run build` 通过。

## 第二部分：观察视角遮挡墙半透明

### 数据结构

- 复原被删除的 `src/scene/occlusionFade.js`（迟滞缓动助手）及其单测
  `tests/unit/occlusion-fade.test.js`（见 git 8ffb206^）。参数用于本特性：
  `createFadeState({ fadeIn: 0.30, restore: 1.0, step: 0.12 })`。
- 在 `createSceneController` 内新增一个被管理网格表：
  `Map<mesh, { fade: number, state: FadeState, cloned: boolean }>`。
  仅登记聚焦建筑的 `building-segment` mesh（**排除** `building-lid`）。

### 遮挡检测（每帧，`updateOcclusion` 扩展）

- 仅当 `interior != null` 运行。
- 用一条 `THREE.Raycaster`，从 `camera.position` 指向 `interior.center`，
  `far = 相机到 center 的距离`。
- 对聚焦建筑的段 mesh 求交；命中距离 < 相机到 center 距离者标记为遮挡物。
- 相机在房间内部时，到 center 前无命中 → 无遮挡物 → 全部趋向实心。

### 材质与淡出

- 基础 `material` 全场景共享，不能逐块改不透明度。首次需要淡化某段时**惰性克隆**其材质
  （`clone()`，置 `transparent = true`），并克隆其子级描边线材质；`cloned = true`。
- 每帧对每个被管理网格：`fade = state.update(fade, isOccluder)`；
  写入 `mesh.material.opacity = fade`，`mesh.material.transparent = fade < 1`；
  子级 `segment-edges` 线材质同步 `opacity`/`transparent`（描边随墙一起淡，避免半透明墙上飘深色轮廓）。
- 目标：遮挡 → 0.30，非遮挡 → 1.0。

### 生命周期与健壮性

- `exitInterior`：把所有被管理网格还原为共享的不透明 `material`（子级描边还原共享 `edgeMaterial`），
  销毁克隆材质，清空管理表。
- 段网格因 revision 变化重建：每帧从活动场景子节点重新解析聚焦建筑的段 mesh
  （与现有 `interior.lid` 刷新同套路），旧 mesh 移出管理表，新 mesh 按需登记。
- `enterInterior` 初始化管理表为空（惰性登记）。

### 与揭盖的关系

不变。`liftY` 以上顶盖 + 上方段硬隐藏（俯瞰）；挡向下视线的观察层墙淡到 30%。
`liftY` 以下第一人称，射线到 center 通常无命中 → 墙保持实心。

### 验证

- 浏览器：进观察视角，从外侧环绕，挡视线的外墙淡到约 30%，能看进房间；转到不挡的角度墙恢复实心；
  升到俯瞰高度顶盖仍整块消失。
- 边界处环绕不出现硬闪烁（迟滞缓动生效）。
- `occlusion-fade.test.js` 通过；`npm test`、`npm run build` 通过。

## 涉及文件

- `src/scene/buildSegmentMeshes.js` —— `edgesFor()` 加 `mergeVertices`。
- `src/scene/occlusionFade.js` —— 复原。
- `tests/unit/occlusion-fade.test.js` —— 复原。
- `src/scene/createSceneController.js` —— 管理表、射线检测、`updateOcclusion` 扩展、
  `enterInterior`/`exitInterior` 生命周期、每帧重新解析。
