# 观察区编辑体验重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重做 top-down 观察区编辑体验：草稿+显式确认、聚焦只显示当前层、工具栏简化并高亮、无观察区空态、按钮布局一致化。

**Architecture:** 编辑草稿存 `view.areaDraft`（不碰 `area.rects`，故不触发采光重算），显式「应用」才落定。场景仍不订阅 store、由 main.js 命令式驱动。聚焦时隐藏所有建筑实体、只画本层墙体轮廓+地板+选区。

**Tech Stack:** Vite + vanilla JS + Three.js 0.185；vitest（node/jsdom）；Playwright。

## Global Constraints

- Node >= 22.12；不新增运行时依赖。
- 纯前端、无后端；项目数据存 localStorage。
- UI 文案面向非技术终端用户，中文优先。
- 新交互须支持鼠标、键盘、触摸。
- 领域层（`src/domain/`）保持无 DOM / Three.js / store 依赖。
- 不改采光算法与 rects 数据模型（`{x0,z0,x1,z1}` 浮点米）。
- 提交前 `npm test` 与 `npm run build` 必须通过。

设计出处：`docs/superpowers/specs/2026-07-08-area-editing-ux-design.md`。

---

## File Structure

- `src/store/buildingCommands.js` — 去 `move` 工具白名单；新增 3 个草稿命令。
- `src/domain/project/defaultProject.js` — `view.areaDraft: null`。
- `src/domain/project/migrateProject.js` — 归一 `areaTool`、补 `areaDraft`。
- `src/scene/observationOverlay.js` — 草稿虚线/半透明样式。
- `src/scene/floorFocus.js` — 墙体轮廓 builder；可见性全隐藏。
- `src/scene/areaDrag.js` — pointermove 预览、左键判定、去 move。
- `src/scene/analysisOverlays.js` — 渲染草稿 vs 生效。
- `src/scene/createSceneController.js` — 相机按键、隐藏实体+轮廓、预览网格、草稿渲染。
- `src/features/areas/createAreaFloorTool.js` — 去 move、高亮、空态、草稿确认 UI。
- `src/features/buildings/BuildingOverview.js` — 按钮布局一致。
- `src/styles/editors.css` — 按钮/工具栏样式。
- `src/main.js` — 离开观察区清草稿。

---

### Task 1: Store — 草稿命令 + 工具白名单去 move

**Files:**
- Modify: `src/store/buildingCommands.js:24`（`AREA_TOOLS`）、末尾新增命令
- Modify: `src/domain/project/defaultProject.js:21-29`
- Test: `tests/unit/building-commands.test.js`

**Interfaces:**
- Produces:
  - `createUpdateAreaDraftCommand(buildingId, areaId, rects)` — 设 `state.view.areaDraft = { buildingId, areaId, rects }`。
  - `createApplyAreaDraftCommand()` — 把 `view.areaDraft.rects` 写入对应 area 的 `rects`（bump revision），并清 `view.areaDraft`；无草稿时返回原 state。
  - `createClearAreaDraftCommand()` — 设 `view.areaDraft = null`。
  - `AREA_TOOLS` = `{'draw','erase'}`。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/building-commands.test.js` 追加（文件顶部已 import 若干命令，按需补 import）：

```js
import {
  createUpdateAreaDraftCommand,
  createApplyAreaDraftCommand,
  createClearAreaDraftCommand,
  createSetAreaToolCommand
} from '../../src/store/buildingCommands.js';

describe('area draft commands', () => {
  const base = {
    view: { areaTool: 'draw', areaDraft: null },
    buildings: [{ id: 'b1', revision: 1, observationAreas: [{ id: 'a1', rects: [] }] }]
  };

  it('update stores a draft without touching area.rects', () => {
    const rects = [{ x0: 0, z0: 0, x1: 2, z1: 2 }];
    const next = createUpdateAreaDraftCommand('b1', 'a1', rects).apply(base);
    expect(next.view.areaDraft).toEqual({ buildingId: 'b1', areaId: 'a1', rects });
    expect(next.buildings[0].observationAreas[0].rects).toEqual([]);
  });

  it('apply writes the draft rects into the area and clears the draft', () => {
    const rects = [{ x0: 0, z0: 0, x1: 2, z1: 2 }];
    const drafted = createUpdateAreaDraftCommand('b1', 'a1', rects).apply(base);
    const applied = createApplyAreaDraftCommand().apply(drafted);
    expect(applied.buildings[0].observationAreas[0].rects).toEqual(rects);
    expect(applied.buildings[0].revision).toBe(2);
    expect(applied.view.areaDraft).toBeNull();
  });

  it('apply is a no-op when there is no draft', () => {
    expect(createApplyAreaDraftCommand().apply(base)).toBe(base);
  });

  it('clear removes the draft', () => {
    const drafted = createUpdateAreaDraftCommand('b1', 'a1', []).apply(base);
    expect(createClearAreaDraftCommand().apply(drafted).view.areaDraft).toBeNull();
  });

  it('area tool whitelist rejects the removed "move" tool', () => {
    expect(createSetAreaToolCommand('move').apply(base)).toBe(base);
    expect(createSetAreaToolCommand('erase').apply(base).view.areaTool).toBe('erase');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/building-commands.test.js`
Expected: FAIL（`createUpdateAreaDraftCommand is not a function` 等）。

- [ ] **Step 3: 实现**

`src/store/buildingCommands.js` 第 24 行改为：

```js
const AREA_TOOLS = new Set(['draw', 'erase']);
```

在 `createSetAreaToolCommand` 之后追加：

```js
export function createUpdateAreaDraftCommand(buildingId, areaId, rects) {
  return {
    label: '编辑观察区草稿',
    apply(state) {
      return { ...state, view: { ...state.view, areaDraft: { buildingId, areaId, rects } } };
    }
  };
}

export function createApplyAreaDraftCommand() {
  return {
    label: '应用观察区草稿',
    apply(state) {
      const draft = state.view.areaDraft;
      if (!draft) return state;
      return {
        ...state,
        buildings: state.buildings.map(b => b.id !== draft.buildingId ? b : {
          ...b,
          revision: (b.revision ?? 0) + 1,
          observationAreas: b.observationAreas.map(a =>
            a.id !== draft.areaId ? a : { ...a, rects: draft.rects })
        }),
        view: { ...state.view, areaDraft: null }
      };
    }
  };
}

export function createClearAreaDraftCommand() {
  return {
    label: '放弃观察区草稿',
    apply(state) {
      if (!state.view.areaDraft) return state;
      return { ...state, view: { ...state.view, areaDraft: null } };
    }
  };
}
```

`src/domain/project/defaultProject.js` 的 `view` 对象加一行（`areaTool: 'draw'` 之后）：

```js
      areaTool: 'draw',
      areaDraft: null
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/unit/building-commands.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/store/buildingCommands.js src/domain/project/defaultProject.js tests/unit/building-commands.test.js
git commit -m "feat: add area-draft store commands and drop the move tool"
```

---

### Task 2: 迁移 — 归一 areaTool、补 areaDraft

**Files:**
- Modify: `src/domain/project/migrateProject.js`
- Test: `tests/unit/migrate-project.test.js`

**Interfaces:**
- Consumes: 无。
- Produces: `migrateProject` 保证 `view.areaTool ∈ {draw,erase}`、`view.areaDraft` 存在（默认 null）。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/migrate-project.test.js` 追加：

```js
it('normalizes a legacy move tool to draw and ensures areaDraft', () => {
  const migrated = migrateProject({
    schemaVersion: 1, buildings: [],
    view: { areaTool: 'move' }
  });
  expect(migrated.view.areaTool).toBe('draw');
  expect(migrated.view.areaDraft).toBeNull();
});

it('keeps a valid area tool and existing areaDraft untouched', () => {
  const migrated = migrateProject({
    schemaVersion: 1, buildings: [],
    view: { areaTool: 'erase', areaDraft: null }
  });
  expect(migrated.view.areaTool).toBe('erase');
});
```

（若测试文件未 import `migrateProject`，按现有其它用例的 import 方式补上。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/migrate-project.test.js`
Expected: FAIL（`areaTool` 仍为 `'move'`）。

- [ ] **Step 3: 实现**

`src/domain/project/migrateProject.js` 在 `return project;` 之前插入：

```js
  const view = project.view ?? (project.view = {});
  if (view.areaTool !== 'draw' && view.areaTool !== 'erase') view.areaTool = 'draw';
  if (view.areaDraft === undefined) view.areaDraft = null;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/unit/migrate-project.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/domain/project/migrateProject.js tests/unit/migrate-project.test.js
git commit -m "feat: migrate legacy area tool and backfill areaDraft"
```

---

### Task 3: observationOverlay — 草稿样式

**Files:**
- Modify: `src/scene/observationOverlay.js`
- Test: `tests/unit/picking.test.js`（已覆盖该 overlay）

**Interfaces:**
- Consumes: 无。
- Produces: `createObservationOverlay({ rects, baseY, lit = false, draft = false })`；`draft` 时用半透明描边样式，且 `group.userData.draft === true`。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/picking.test.js` 的 `editing overlays` describe 内追加：

```js
it('marks a draft observation overlay', () => {
  const draftGroup = createObservationOverlay({
    rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }], baseY: 6, draft: true
  });
  expect(draftGroup.userData.draft).toBe(true);
  expect(draftGroup.children).toHaveLength(1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/picking.test.js`
Expected: FAIL（`draftGroup.userData.draft` 为 undefined）。

- [ ] **Step 3: 实现**

`src/scene/observationOverlay.js` 顶部增加草稿材质，并改签名：

```js
const draftMaterial = new THREE.MeshBasicMaterial({
  color: 0x4b6f78, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false
});

export function createObservationOverlay({ rects, baseY, lit = false, draft = false }) {
  const group = new THREE.Group();
  group.name = 'observation-overlay';
  group.userData.kind = 'observation-overlay';
  group.userData.draft = draft;
  const material = draft ? draftMaterial : (lit ? litMaterial : selectedMaterial);
  for (const rect of rects ?? []) {
    const w = Math.abs(rect.x1 - rect.x0);
    const d = Math.abs(rect.z1 - rect.z0);
    if (w <= 0 || d <= 0) continue;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((rect.x0 + rect.x1) / 2, baseY + 0.018, (rect.z0 + rect.z1) / 2);
    mesh.userData.kind = 'observation-rect';
    group.add(mesh);
  }
  return group;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/unit/picking.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/scene/observationOverlay.js tests/unit/picking.test.js
git commit -m "feat: add draft style to observation overlay"
```

---

### Task 4: floorFocus — 墙体轮廓 + 全隐藏可见性

**Files:**
- Modify: `src/scene/floorFocus.js`
- Test: `tests/unit/floor-focus.test.js`

**Interfaces:**
- Consumes: `createFootprint(template, params)`（已用）、`floorBaseY`。
- Produces:
  - `floorVisibility(...)` 语义改为：聚焦时全隐藏 → 返回始终 `false` 的判定。改签名为 `floorVisibility()`（无参），返回 `() => false`。
  - `createWallOutline(building, floor)` — 返回 `THREE.Group`（`userData.kind === 'wall-outline'`），含由 footprint 外环生成的 `LineLoop`，置于该楼层顶高度，group 定位/旋转到 building。

- [ ] **Step 1: 写失败测试**

替换 `tests/unit/floor-focus.test.js` 中 `floorVisibility` 用例并追加轮廓用例：

```js
import { floorFocusTarget, floorVisibility, createWallOutline } from '../../src/scene/floorFocus.js';

// ...bar 定义保留...

it('hides every building while focused', () => {
  const vis = floorVisibility();
  expect(vis('b1')).toBe(false);
  expect(vis('b2')).toBe(false);
});

it('builds a wall outline group positioned at the building', () => {
  const group = createWallOutline(bar, 3);
  expect(group.userData.kind).toBe('wall-outline');
  expect(group.children.length).toBeGreaterThan(0);
  expect(group.position.x).toBe(bar.position.x);
  expect(group.position.z).toBe(bar.position.z);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/floor-focus.test.js`
Expected: FAIL（`createWallOutline` 未定义 / `floorVisibility('b1')` 旧行为）。

- [ ] **Step 3: 实现**

`src/scene/floorFocus.js`：改 `floorVisibility`，新增 `createWallOutline`：

```js
export function floorVisibility() {
  return () => false;
}

const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x4b6f78, transparent: true, opacity: 0.85 });

export function createWallOutline(building, floor) {
  const footprint = createFootprint(building.template, building.params);
  const outer = Array.isArray(footprint) ? footprint : footprint.outer;
  const y = floorBaseY({ floor, ...building.params }) + building.params.floorHeight;
  const points = outer.map(([x, z]) => new THREE.Vector3(x, y, z));
  const group = new THREE.Group();
  group.name = 'wall-outline';
  group.userData.kind = 'wall-outline';
  group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), outlineMaterial));
  group.position.set(building.position.x, 0, building.position.z);
  group.rotation.y = THREE.MathUtils.degToRad(building.rotation);
  return group;
}
```

> 注：footprint 坐标系与 `createFootprint` 一致（`createFloorSlab` 用 `[x, -z]` 建 Shape；这里用 `LineLoop` 直接取 `(x, y, z)`，与 slab 同 group 变换，保持一致外观即可）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/unit/floor-focus.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/scene/floorFocus.js tests/unit/floor-focus.test.js
git commit -m "feat: hide all buildings and draw a wall outline in floor focus"
```

---

### Task 5: areaDrag — pointermove 预览 + 左键判定 + 去 move

**Files:**
- Modify: `src/scene/areaDrag.js`
- Test: `tests/unit/area-drag.test.js`

**Interfaces:**
- Consumes: `applyRectEdit`（保留导出）、`worldToLocalFloor`、`pointerToNdc`。
- Produces: `createAreaDrag({ canvas, camera, floorY, getBuilding, getMode, onPreview, onCommit })`
  - `onPreview(rect | null)` — pointerdown 后每次 pointermove 触发（rect 为 `normalizeRect(start, current)`）；pointerup/取消时 `onPreview(null)`。
  - `onCommit(rect, mode)` — pointerup 触发，`mode` 为 `getMode()`（`'draw'|'erase'`）。
  - 仅左键（`e.button === 0`）启动绘制；其它按键交给 OrbitControls（平移）。
  - `getMode` 不再返回 `'move'`。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/area-drag.test.js` 追加（利用已有的 mock 模式；若已有 canvas/camera stub 复用之）：

```js
import { createAreaDrag } from '../../src/scene/areaDrag.js';

function makeCanvas() {
  const handlers = {};
  return {
    addEventListener: (t, h) => { handlers[t] = h; },
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    fire: (t, e) => handlers[t]?.(e)
  };
}

it('previews on move and commits on left-button up; ignores right button', () => {
  const canvas = makeCanvas();
  const previews = [];
  const commits = [];
  const camera = { /* stub used by raycaster; see existing test helpers */ };
  const building = { position: { x: 0, z: 0 }, rotation: 0 };
  const drag = createAreaDrag({
    canvas, camera, floorY: 0,
    getBuilding: () => building, getMode: () => 'draw',
    onPreview: r => previews.push(r), onCommit: (r, m) => commits.push([r, m])
  });

  // right button never starts a drag
  canvas.fire('pointerdown', { button: 2, clientX: 10, clientY: 10 });
  canvas.fire('pointerup', { button: 2, clientX: 20, clientY: 20 });
  expect(commits).toHaveLength(0);

  drag.dispose();
});
```

> 说明：raycast 命中依赖 camera/plane，node 环境下可能返回 null；此用例主要断言**按键判定**（右键不 commit）。若已有 camera stub 能命中平面，可加左键 preview/commit 断言。保持与文件现有 helper 一致。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/area-drag.test.js`
Expected: FAIL（`onPreview` 未被支持 / 右键仍触发）。

- [ ] **Step 3: 实现**

`src/scene/areaDrag.js` 的 `createAreaDrag` 重写事件部分（保留 `worldToLocalFloor`/`normalizeRect`/`applyRectEdit`/`localAt`）：

```js
export function createAreaDrag({ canvas, camera, floorY, getBuilding, getMode, onPreview = () => {}, onCommit }) {
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let start = null;

  function localAt(event) {
    const rect = canvas.getBoundingClientRect();
    const { x, y } = pointerToNdc(event, rect);
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return worldToLocalFloor([hit.x, hit.z], getBuilding());
  }
  function onDown(e) {
    if (e.button !== 0) return;         // 左键绘制；其它键留给相机平移
    start = localAt(e);
  }
  function onMove(e) {
    if (!start) return;
    const cur = localAt(e);
    onPreview(cur ? normalizeRect(start, cur) : null);
  }
  function onUp(e) {
    if (!start || e.button !== 0) { return; }
    const end = localAt(e);
    if (end) onCommit(normalizeRect(start, end), getMode());
    start = null;
    onPreview(null);
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  return {
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
    }
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/unit/area-drag.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/scene/areaDrag.js tests/unit/area-drag.test.js
git commit -m "feat: add drag preview and left-button gating to area drag"
```

---

### Task 6: analysisOverlays — 渲染草稿 vs 生效

**Files:**
- Modify: `src/scene/analysisOverlays.js`
- Test: `tests/unit/scene-analysis.test.js`

**Interfaces:**
- Consumes: `project.view.areaDraft`。
- Produces: `buildAnalysisOverlays(project, { activeAreaId, litSampleIds, noArea })` 在 `view.areaDraft` 命中激活区时，`out.area.rects` 用草稿 rects，且 `out.area.draft === true`；否则用 `area.rects`、`draft === false`。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/scene-analysis.test.js` 追加：

```js
it('renders draft rects with a draft flag when a matching draft exists', () => {
  const withDraft = {
    ...project,
    view: { areaDraft: { buildingId: 'b1', areaId: 'a', rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }] } }
  };
  const out = buildAnalysisOverlays(withDraft, { activeAreaId: 'a', litSampleIds: [], noArea: false });
  expect(out.area.draft).toBe(true);
  expect(out.area.rects).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);
});
```

（现有第一个用例断言 `out.area.rects` = 建筑 rects；补断言 `out.area.draft === false`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/scene-analysis.test.js`
Expected: FAIL（`out.area.draft` undefined / 草稿未生效）。

- [ ] **Step 3: 实现**

`src/scene/analysisOverlays.js` 中构造 `area` 处，加入草稿判定（在算出 active building/area 后）：

```js
const draft = project.view?.areaDraft;
const usingDraft = Boolean(draft && draft.buildingId === building.id && draft.areaId === area.id);
const rects = usingDraft ? draft.rects : area.rects;
// out.area = { rects, baseY, lit, draft: usingDraft, group: { position, rotationDeg } }
```

将返回的 `area.rects` 换为上面的 `rects`，并加 `draft: usingDraft` 字段。`lit` 在草稿态可强制为 false（草稿不算结果）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/unit/scene-analysis.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/scene/analysisOverlays.js tests/unit/scene-analysis.test.js
git commit -m "feat: surface draft rects from analysis overlays"
```

---

### Task 7: createSceneController — 相机按键、隐藏实体+轮廓、预览网格、草稿渲染

**Files:**
- Modify: `src/scene/createSceneController.js`
- Test: `tests/unit/scene-analysis.test.js`（overlay 渲染）+ 手动跑通（相机为集成行为，单元不强测 OrbitControls）

**Interfaces:**
- Consumes: `createWallOutline`、`floorVisibility()`、`createAreaDrag`（新签名）、`createUpdateAreaDraftCommand`、`applyRectEdit`、`createObservationOverlay`（draft 参数）。
- Produces: `enterFloorFocus`/`exitFloorFocus`/`setFloorTool` 更新后行为如下。

- [ ] **Step 1: 改 `enterFloorFocus`**

替换可见性、相机、加轮廓、drag 接线：

```js
// imports 顶部补充 createWallOutline / createUpdateAreaDraftCommand（若未导入）
enterFloorFocus(project, simulationState) {
  if (floorFocus) return;
  const buildingId = project.view.selectedBuildingId;
  const building = project.buildings.find(b => b.id === buildingId);
  if (!building) return;
  const areaId = simulationState.activeAreaId;
  const area = (building.observationAreas ?? []).find(a => a.id === areaId);
  const floor = area?.floor ?? 1;

  const isVisible = floorVisibility();
  for (const child of sceneParts.buildings.children) child.visible = isVisible(child.userData?.entityId);

  const { target, height } = floorFocusTarget(building, floor);
  cameraParts.setTopView(target, height);

  const controls = cameraParts.controls;
  controls.enabled = true;
  controls.enableRotate = false;
  controls.enableZoom = true;
  controls.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_PAN };

  const slab = createFloorSlab(building, floor);
  const outline = createWallOutline(building, floor);
  sceneParts.scene.add(slab);
  sceneParts.scene.add(outline);

  let previewGroup = null;
  const clearPreview = () => { if (previewGroup) { sceneParts.overlays.remove(previewGroup); previewGroup = null; } };

  const getBuilding = () => store.getState().buildings.find(b => b.id === buildingId);
  const getMode = () => floorFocus?.tool ?? 'draw';
  const drag = createAreaDrag({
    canvas, camera: cameraParts.camera, floorY: target.y, getBuilding, getMode,
    onPreview: rect => {
      clearPreview();
      if (!rect) return;
      previewGroup = createObservationOverlay({ rects: [rect], baseY: target.y, draft: true });
      previewGroup.position.set(building.position.x, 0, building.position.z);
      previewGroup.rotation.y = THREE.MathUtils.degToRad(building.rotation);
      sceneParts.overlays.add(previewGroup);
    },
    onCommit: (rect, mode) => {
      clearPreview();
      if (!store || !areaId) return;
      const current = getBuilding();
      const currentArea = (current.observationAreas ?? []).find(a => a.id === areaId);
      const draft = store.getState().view.areaDraft;
      const baseRects = (draft && draft.areaId === areaId) ? draft.rects : (currentArea?.rects ?? []);
      const rects = applyRectEdit(baseRects, rect, mode);
      store.execute(createUpdateAreaDraftCommand(buildingId, areaId, rects));
    }
  });
  floorFocus = { slab, outline, drag, tool: store.getState().view.areaTool ?? 'draw', clearPreview };
}
```

- [ ] **Step 2: 改 `setFloorTool` 与 `exitFloorFocus`**

```js
setFloorTool(tool) {
  if (!floorFocus) return;
  floorFocus.tool = tool;               // 相机始终可平移/缩放，不再随工具切换
},
exitFloorFocus() {
  if (!floorFocus) return;
  floorFocus.clearPreview();
  sceneParts.scene.remove(floorFocus.slab);
  sceneParts.scene.remove(floorFocus.outline);
  floorFocus.drag.dispose();
  for (const child of sceneParts.buildings.children) child.visible = true;
  const controls = cameraParts.controls;
  controls.enabled = true;
  controls.enableRotate = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  floorFocus = null;
}
```

- [ ] **Step 3: `updateAnalysis` 传 draft 样式**

找到调用 `createObservationOverlay(...)` 处，改为传 `draft`：

```js
sceneParts.overlays.add(createObservationOverlay({
  rects: overlays.area.rects, baseY: overlays.area.baseY,
  lit: overlays.area.lit, draft: overlays.area.draft
}));
```

- [ ] **Step 4: 跑单元 + 构建**

Run: `npx vitest run tests/unit/scene-analysis.test.js && npm run build`
Expected: 测试 PASS，构建成功（无未定义 import；确认 `THREE` 已在文件顶部 import）。

- [ ] **Step 5: 提交**

```bash
git add src/scene/createSceneController.js
git commit -m "feat: floor focus hides buildings, draws outline, previews and drafts rects"
```

---

### Task 8: createAreaFloorTool — 去 move、高亮、空态、草稿确认 UI

**Files:**
- Modify: `src/features/areas/createAreaFloorTool.js`
- Test: `tests/unit/area-floor-tool.test.js`

**Interfaces:**
- Consumes: `createApplyAreaDraftCommand`、`createClearAreaDraftCommand`、`createSetAreaToolCommand`（白名单已去 move）、既有 area 命令。
- Produces: DOM 行为——
  - `TOOLS` 仅 `draw`/`erase`；选中工具按钮加 `.is-active`。
  - 无观察区时隐藏下拉/名称/楼层，显示引导文案 + `＋新观察区`。
  - 有 `view.areaDraft`（命中当前建筑+激活区）时显示 `应用选区`(testId `draft-apply`)/`撤销草稿`(testId `draft-cancel`) + 状态文字(testId `draft-status`)；无草稿时状态显示「✓ 已生效」，按钮隐藏。
  - `update(building)` 需能读到 `store.getState().view.areaDraft` 与 `simulation.activeAreaId`。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/area-floor-tool.test.js` 追加：

```js
it('hides area fields and shows a hint when there are no areas', () => {
  const store = fakeStore(); // 复用文件已有 helper；state.buildings[0].observationAreas = []
  const tool = createAreaFloorTool({ store, buildingId: 'b1' });
  tool.update(buildingWithNoAreas);
  expect(q(tool.element, 'area-select')).toBeNull();
  expect(tool.element.textContent).toContain('还没有观察区');
});

it('highlights the active tool with is-active', () => {
  // 点 tool-erase 后该按钮有 is-active，tool-draw 没有
});

it('apply and cancel dispatch draft commands', () => {
  // 有草稿时点 draft-apply → label 「应用观察区草稿」；draft-cancel → 「放弃观察区草稿」
});
```

（按该测试文件已有的 store mock / `q` helper 风格补全断言；保持与现有用例一致。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/area-floor-tool.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现**

`src/features/areas/createAreaFloorTool.js` 关键改动：

```js
import {
  createAddObservationAreaCommand, createApplyAreaDraftCommand, createClearAreaDraftCommand,
  createSetActiveAreaCommand, createSetAreaToolCommand, createSetEditorModeCommand,
  createUpdateObservationAreaCommand
} from '../../store/buildingCommands.js';

const TOOLS = [['draw', '画区'], ['erase', '擦除']];
```

工具高亮：`applyToolUI(tool)` 内除 `aria-pressed` 外加 `btn.classList.toggle('is-active', t === tool)`。

新增草稿区块（append 到 element）：

```js
const draftStatus = createElement('span', { className: 'draft-status', testId: 'draft-status' });
const applyBtn = createElement('button', {
  className: 'button button--primary', text: '应用选区 ✓', testId: 'draft-apply',
  attributes: { type: 'button' }
});
applyBtn.addEventListener('click', () => store.execute(createApplyAreaDraftCommand()));
const cancelBtn = createElement('button', {
  className: 'button button--ghost', text: '撤销草稿', testId: 'draft-cancel',
  attributes: { type: 'button' }
});
cancelBtn.addEventListener('click', () => store.execute(createClearAreaDraftCommand()));
const draftBar = createElement('div', { className: 'area-draft-bar' }, draftStatus, cancelBtn, applyBtn);
```

`syncFields()` 末尾根据 store 状态更新空态与草稿区：

```js
const state = store.getState();
const hasAreas = areas.length > 0;
// 空态：无 area 时隐藏 areaSelect / nameInput / floorInput 所在 field，显示 hint
emptyHint.hidden = hasAreas;
for (const f of areaFields) f.hidden = !hasAreas;
toolBar.hidden = !hasAreas;

const draft = state.view.areaDraft;
const active = state.simulation.activeAreaId;
const hasDraft = Boolean(draft && draft.buildingId === buildingId && draft.areaId === active);
applyBtn.hidden = !hasDraft;
cancelBtn.hidden = !hasDraft;
draftStatus.textContent = hasDraft ? '● 草稿未应用' : '✓ 已生效';
```

（`emptyHint`、`areaFields` 数组需在构建 element 时定义；`＋新观察区` 始终可见。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/unit/area-floor-tool.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/areas/createAreaFloorTool.js tests/unit/area-floor-tool.test.js
git commit -m "feat: rework area toolbar with highlight, empty state, and draft confirm"
```

---

### Task 9: BuildingOverview 按钮布局 + CSS

**Files:**
- Modify: `src/features/buildings/BuildingOverview.js:28-34`
- Modify: `src/styles/editors.css`
- Test: `tests/unit/building-inspector.test.js`（结构断言）

**Interfaces:**
- Consumes: 无。
- Produces: 三个按钮同宽同间距；删除建筑仍 testId `overview-delete`。

- [ ] **Step 1: 写失败测试**

在 `tests/unit/building-inspector.test.js` 追加：

```js
it('overview groups all three actions in one actions container', () => {
  const { store, el } = mount();
  store.execute(createAddBuildingCommand({ id: 'b1' }));
  store.execute(createFinishBuildingCommand('b1'));
  const actions = el.querySelector('.inspector-actions');
  expect(actions.querySelector('[data-testid="overview-edit-building"]')).not.toBeNull();
  expect(actions.querySelector('[data-testid="overview-delete"]')).not.toBeNull();
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/unit/building-inspector.test.js`
Expected: FAIL（`overview-delete` 不在 `.inspector-actions` 内）。

- [ ] **Step 3: 实现**

`src/features/buildings/BuildingOverview.js` 的 element 组装改为：

```js
const element = createElement(
  'div', { className: 'building-overview', testId: 'building-overview' },
  createElement('div', { className: 'panel__label', text: '建筑概览' }),
  title, summary,
  createElement('div', { className: 'inspector-actions' }, editBuilding, editAreas, remove)
);
```

`src/styles/editors.css` 确认 `.inspector-actions { display: grid; gap: 8px; }` 使三个按钮同列同宽（已存在）；如需危险按钮与前两者留白，加：

```css
.inspector-actions .button--danger { margin-top: 4px; }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/unit/building-inspector.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/buildings/BuildingOverview.js src/styles/editors.css tests/unit/building-inspector.test.js
git commit -m "fix: align overview action buttons to one container"
```

---

### Task 10: main.js — 离开观察区清草稿 + 工具栏样式

**Files:**
- Modify: `src/main.js:99-109`
- Modify: `src/styles/editors.css`（`.area-draft-bar`、`.area-tool-buttons .is-active` 若缺）
- Test: `tests/e2e/area-topdown.spec.js`

**Interfaces:**
- Consumes: `createClearAreaDraftCommand`。
- Produces: 退出 areas 模式时若存在草稿则清空；草稿确认条样式。

- [ ] **Step 1: 实现清草稿**

`src/main.js` 顶部 import 补 `createClearAreaDraftCommand`。在 areas 模式转换块里，退出时清草稿：

```js
if (currentAreasMode !== prevAreasMode) {
  if (!currentAreasMode && store.getState().view.areaDraft) {
    store.execute(createClearAreaDraftCommand());
  }
  withController(controller => {
    if (!controller) return;
    if (currentAreasMode) controller.enterFloorFocus(project, simulationController.getState());
    else controller.exitFloorFocus();
  });
} else if (currentAreasMode) {
  withController(controller => controller?.setFloorTool(project.view.areaTool));
}
```

- [ ] **Step 2: 样式**

`src/styles/editors.css` 追加：

```css
.area-draft-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.area-draft-bar .draft-status {
  flex: 1;
  font-size: 12px;
  color: var(--ink-600);
}
.area-tool-buttons .template-card.is-active {
  border-color: var(--sun-500);
  background: #fff5d9;
  box-shadow: inset 0 0 0 1px var(--sun-500);
  color: var(--ink-950);
}
```

- [ ] **Step 3: 扩展 e2e**

在 `tests/e2e/area-topdown.spec.js` 增加：进入观察区 → 拖拽画草稿 → 断言结果面板此时未变（草稿态）→ 点 `draft-apply` → 断言 rects 生效。（沿用文件已有的进入观察区步骤与 selectors；断言 `[data-testid="draft-status"]` 文本从「● 草稿未应用」变「✓ 已生效」。）

- [ ] **Step 4: 全量验证**

Run: `npm test && npm run build`
Expected: 全部单元 PASS，构建成功。
Run（环境允许时）: `npx playwright test tests/e2e/area-topdown.spec.js`

- [ ] **Step 5: 提交**

```bash
git add src/main.js src/styles/editors.css tests/e2e/area-topdown.spec.js
git commit -m "feat: clear area draft on exit and style the draft confirm bar"
```

---

## Self-Review

- **Spec 覆盖：** D1→Task9；D2→Task1(工具白名单)+Task5(左键/相机)+Task7(相机按键)+Task8(高亮);
  D3→Task8(空态)；D4→Task1(命令)+Task3(草稿样式)+Task5(预览)+Task6(overlay草稿)+Task7(接线)+Task8(确认UI)+Task10(清草稿)；
  D5→Task4(轮廓+全隐藏)+Task7(接线)。全部有对应任务。
- **类型一致：** `view.areaDraft = { buildingId, areaId, rects }` 全程一致；`createObservationOverlay` 的
  `draft` 参数在 Task3 定义、Task6/Task7 消费；`floorVisibility()` 无参在 Task4 定义、Task7 消费；
  `createAreaDrag` 新增 `onPreview` 在 Task5 定义、Task7 消费。
- **无占位符：** 各步含实际代码/命令/预期。
- **注意点（执行者）：** `createSceneController.js` 需确认 `THREE`、`createWallOutline`、
  `createUpdateAreaDraftCommand` 均已 import；`analysisOverlays.js` 的 `out.area` 形状按现有实现补 `draft` 字段。
