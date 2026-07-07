# 显式编辑模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"选中建筑"与"编辑建筑"解耦——选中只高亮+显示只读概览,用户显式选择进入"编辑建筑参数"或"观察区与窗"两个互斥编辑器之一;顺带结构性消除单栋建筑点不出"添加观察区"的 bug。

**Architecture:** 用 `view.editorMode: 'none'|'building'|'areas'` 枚举替换 `view.editingBuildingId`。右栏(`BuildingInspector`)变成按 `(selectedBuildingId, editorMode)` 挂载「概览 A / 参数 B / 观察区 C」之一的小路由,渲染 key 从 `selectedBuildingId` 变为 `${selectedBuildingId}:${editorMode}`——add→finish 时 key 变化触发重建,bug 消失。场景加"选中高亮"材质,区别于"编辑蓝图"。采用 expand-migrate-contract:先引入 `editorMode` 为真相源、把 `editingBuildingId` 降级为派生镜像保持消费者不坏,逐个迁移消费者,最后一步移除镜像。

**Tech Stack:** 原生 ES 模块、Three.js 0.185、Vitest(node + 单文件 jsdom pragma)、Playwright。`src/domain/` 保持无 DOM/Three.js。

## Global Constraints

- Node >= 22.12;不新增运行时/产品依赖(jsdom 已作为 devDependency 存在,可用)。
- `src/domain/` 内代码不 import DOM/Three.js。
- 新交互需同时支持鼠标、键盘、触屏(概览/返回/入口按钮均为原生 `<button>`,天然可达)。
- UI 文案面向普通用户,中文优先。
- 每个任务结束运行 `npm test` 全绿再提交;交付前 `npm test` + `npm run build` 通过,e2e 至少 `--list` 解析通过(本环境无法下载 Playwright 浏览器,运行留待有浏览器的机器)。
- TDD:先写失败测试→确认 RED→最小实现→确认 GREEN→提交。
- 迁移期间 `editingBuildingId` 作为派生镜像存在(`editorMode==='building' ? selectedBuildingId : null`),使旧消费者不坏;最后一个任务移除它。

## editorMode 语义(全任务共享)

```
view.selectedBuildingId : string|null   选中的楼(高亮 + 概览依据)
view.editorMode         : 'none'|'building'|'areas'   右栏三互斥界面
view.addingBuildingId   : string|null   区分"刚新建、可取消本次添加"
```

派生(不单独作为真相源):
- `editingBuildingId`(迁移期镜像)= `editorMode==='building' ? selectedBuildingId : null`
- `previewBuildingId`(蓝图)= `editorMode==='building' ? selectedBuildingId : null`
- `highlightBuildingId`(高亮)= `selectedBuildingId && editorMode!=='building' ? selectedBuildingId : null`

## File Structure

- `src/domain/project/defaultProject.js` — `view` 加 `editorMode:'none'`(迁移期保留 `editingBuildingId`)。
- `src/store/buildingCommands.js` — 命令改写 + `createSetEditorModeCommand`;`deriveEditing(view)` 镜像 helper。
- `src/scene/buildingMesh.js` — 加高亮材质变体。
- `src/scene/syncScene.js` — 签名扩为 `${revision}:${preview}:${highlight}`。
- `src/scene/scenePreview.js`(新) — 纯函数 `deriveScenePreview(view)`。
- `src/scene/createSceneController.js` + `src/main.js` — 用 `deriveScenePreview`;picking 只选中不编辑;主循环订阅迁移到 editorMode。
- `src/features/buildings/BuildingOverview.js`(新) — 概览卡片 A。
- `src/features/buildings/BuildingInspector.js` — 改为按 `(selectedBuildingId, editorMode)` 的 A/B/C 路由。
- `src/features/shell/AppShell.js` + `src/features/shell/MobileShell.js` — 右栏显隐 + 移动端切 tab 按 editorMode。
- 测试:`tests/unit/building-commands.test.js`、`tests/unit/scene-sync.test.js`、新增 `tests/unit/scene-preview.test.js`、`tests/unit/building-overview.test.js`、`tests/unit/building-inspector.test.js`、`tests/unit/app-shell.test.js`、新增 e2e `tests/e2e/edit-modes.spec.js`。

---

### Task 1: store 引入 editorMode(真相源)+ editingBuildingId 降级为派生镜像

**Files:**
- Modify: `src/domain/project/defaultProject.js`
- Modify: `src/store/buildingCommands.js`
- Test: `tests/unit/building-commands.test.js`

**Interfaces:**
- Consumes: 现有 `BUILDING_DEFAULTS`, `normalizeRotation`, `nextBuildingName`, `findBuilding`。
- Produces:
  - `deriveEditing(view) -> { ...view, editingBuildingId }`：镜像 helper,`editingBuildingId = view.editorMode==='building' ? view.selectedBuildingId : null`。所有命令返回的 `view` 都过它,保证镜像一致。
  - `createSelectBuildingCommand(buildingId)`(去掉 `{editing}` 入参)→ `selectedBuildingId=buildingId, editorMode='none'`。
  - `createAddBuildingCommand(overrides)` → 新楼,`selectedBuildingId=id, editorMode='building', addingBuildingId=id`。
  - `createSetEditorModeCommand(mode)`(新)→ `mode∈{'none','building','areas'}`;非法 mode 返回原 state;`editorMode='building'|'areas'` 但无 `selectedBuildingId` 时返回原 state。只改 `editorMode`,不动 `selectedBuildingId`。
  - `createFinishBuildingCommand(buildingId)` → 若 `editorMode==='building' && selectedBuildingId===buildingId`:`editorMode='none'`,清 `addingBuildingId`(若等于该 id);否则返回原 state。
  - `createCancelAddedBuildingCommand` / `createRemoveBuildingCommand` / `createClearBuildingsCommand` → 相应清空后 `editorMode='none'`。

> 迁移策略:本任务后 `editingBuildingId` 仍在 state 里(由 `deriveEditing` 维护),旧消费者(main.js/scene/AppShell)读它仍工作。语义变化:旧代码"选中即 editing",新代码"选中 editorMode='none'"——因此 `editingBuildingId` 在纯选中后变为 `null`。这会让"选中建筑后右栏显示参数表单"暂时变成"不显示"(AppShell 的 `updateInspector` 用 `selectedBuildingId` 判显隐,BuildingInspector 用 `renderedId`)。为避免中间任务界面破损,BuildingInspector 与 AppShell 的适配放在 Task 5/6;**在此之前 Task 1 只保证命令层与命令测试自洽、全套单测绿**(inspector 测试此时仍按旧行为,Task 5 一并改)。

- [ ] **Step 1: 写失败测试(命令层)**

在 `tests/unit/building-commands.test.js` 顶部 import 增加 `createSetEditorModeCommand`。追加:

```javascript
describe('explicit editor mode', () => {
  it('select only selects, does not enter editing', () => {
    let p = createAddBuildingCommand({ id: 'b1' }).apply(createDefaultProject());
    p = createFinishBuildingCommand('b1').apply(p);
    const next = createSelectBuildingCommand('b1').apply(p);
    expect(next.view.selectedBuildingId).toBe('b1');
    expect(next.view.editorMode).toBe('none');
    expect(next.view.editingBuildingId).toBeNull();
  });

  it('add building starts in building editor mode', () => {
    const next = createAddBuildingCommand({ id: 'b1' }).apply(createDefaultProject());
    expect(next.view).toMatchObject({
      selectedBuildingId: 'b1', editorMode: 'building', addingBuildingId: 'b1'
    });
    expect(next.view.editingBuildingId).toBe('b1'); // 镜像
  });

  it('setEditorMode switches between areas and building without touching selection', () => {
    let p = createAddBuildingCommand({ id: 'b1' }).apply(createDefaultProject());
    p = createFinishBuildingCommand('b1').apply(p);            // none
    p = createSetEditorModeCommand('areas').apply(p);
    expect(p.view).toMatchObject({ selectedBuildingId: 'b1', editorMode: 'areas' });
    expect(p.view.editingBuildingId).toBeNull();               // areas 不是 building
    p = createSetEditorModeCommand('building').apply(p);
    expect(p.view.editorMode).toBe('building');
    expect(p.view.editingBuildingId).toBe('b1');               // 镜像随 building
  });

  it('setEditorMode is a no-op with an invalid mode or no selection', () => {
    const base = createDefaultProject();
    expect(createSetEditorModeCommand('bogus').apply(base)).toBe(base);
    expect(createSetEditorModeCommand('building').apply(base)).toBe(base); // 无 selectedBuildingId
  });

  it('finish returns to overview (editorMode none)', () => {
    let p = createAddBuildingCommand({ id: 'b1' }).apply(createDefaultProject());
    p = createFinishBuildingCommand('b1').apply(p);
    expect(p.view).toMatchObject({ selectedBuildingId: 'b1', editorMode: 'none', addingBuildingId: null });
    expect(p.view.editingBuildingId).toBeNull();
  });
});
```

同时**改**现有断言:`building-commands.test.js` 里所有 `editingBuildingId: 'building-x'`/`selectedBuildingId+editingBuildingId` 的期望,按新语义调整——`createAddBuildingCommand` 后 `editorMode:'building'`(镜像 editingBuildingId 仍等于 id,故大多数现有断言仍成立);`createSelectBuildingCommand(id, {editing:true})` 调用点改为 `createSelectBuildingCommand(id)` 且断言 `editorMode` 而非 editing。逐条跑测试驱动修正。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/building-commands.test.js`
Expected: FAIL(`createSetEditorModeCommand` 未定义 + 新断言不满足)。

- [ ] **Step 3: 实现**

`defaultProject.js`:`view` 内 `editingBuildingId: null` 之上加 `editorMode: 'none',`(两者都留,editingBuildingId 迁移期作镜像)。

`buildingCommands.js` 顶部加 helper 并让每个命令的 `view` 过它:

```javascript
const EDITOR_MODES = new Set(['none', 'building', 'areas']);

function deriveEditing(view) {
  return {
    ...view,
    editingBuildingId: view.editorMode === 'building' ? view.selectedBuildingId : null
  };
}
```

- `createAddBuildingCommand`:`view` 改为
```javascript
        view: deriveEditing({
          ...state.view,
          selectedBuildingId: id,
          editorMode: 'building',
          addingBuildingId: id
        })
```
- `createSelectBuildingCommand(buildingId)`(去掉第二参数):
```javascript
export function createSelectBuildingCommand(buildingId) {
  return {
    label: '选择建筑',
    apply(state) {
      return {
        ...state,
        view: deriveEditing({ ...state.view, selectedBuildingId: buildingId, editorMode: 'none' })
      };
    }
  };
}
```
- 新增:
```javascript
export function createSetEditorModeCommand(mode) {
  return {
    label: '切换编辑模式',
    apply(state) {
      if (!EDITOR_MODES.has(mode)) return state;
      if (mode !== 'none' && !state.view.selectedBuildingId) return state;
      return { ...state, view: deriveEditing({ ...state.view, editorMode: mode }) };
    }
  };
}
```
- `createFinishBuildingCommand(buildingId)`:
```javascript
export function createFinishBuildingCommand(buildingId) {
  return {
    label: '完成建筑',
    apply(state) {
      if (state.view.editorMode !== 'building' || state.view.selectedBuildingId !== buildingId) return state;
      return {
        ...state,
        view: deriveEditing({
          ...state.view,
          editorMode: 'none',
          addingBuildingId: state.view.addingBuildingId === buildingId ? null : state.view.addingBuildingId
        })
      };
    }
  };
}
```
- `createCancelAddedBuildingCommand` / `createRemoveBuildingCommand` / `createClearBuildingsCommand`:把各自 `view` 里的 `editingBuildingId: ... ? null : ...` 整块替换为 `editorMode: 'none'`,并用 `deriveEditing({...})` 包裹。例如 clear:
```javascript
        view: deriveEditing({
          ...state.view,
          selectedBuildingId: null,
          editorMode: 'none',
          addingBuildingId: null
        })
```
(cancel/remove 保留其对 selectedBuildingId 的原条件逻辑,只把 editing 字段换成 editorMode='none' 常量,因为删除/取消都回到无编辑态。)

- [ ] **Step 4: 运行确认通过 + 全套回归**

Run: `npx vitest run tests/unit/building-commands.test.js` → PASS
Run: `npm test` → 期望除 `building-inspector`/`app-shell` 相关(若有依赖旧 select 签名的)外全绿。**若** scene-sync/simulation 等因 `createSelectBuildingCommand` 签名变化而挂,说明有调用点传了第二参数——用 grep 找 `createSelectBuildingCommand(` 全部调用点确认(main.js、DesktopShell、picking 相关),这些在 Task 3/5 迁移;本步只要命令测试与不涉及这些调用点的测试绿即可。若 `npm test` 有红,记录哪些文件红、确认都属于"待后续任务迁移的旧调用点",不属于则修。

> 说明:`DesktopShell.js` 和 `createSceneController`/`main.js` 目前调用 `createSelectBuildingCommand(id, {editing:true})`。去掉第二参数后 JS 不报错(多余实参被忽略),行为变为"只选中"。这正是目标行为,但会让"点树/点场景→右栏出参数表单"暂时失效,直到 Task 5 适配 inspector。全套单测里若有断言这条旧行为的,归到 Task 5 修。

- [ ] **Step 5: 提交**

```bash
git add src/domain/project/defaultProject.js src/store/buildingCommands.js tests/unit/building-commands.test.js
git commit -m "feat: introduce explicit editorMode, mirror editingBuildingId during migration"
```

---

### Task 2: 场景派生纯函数 deriveScenePreview

**Files:**
- Create: `src/scene/scenePreview.js`
- Test: `tests/unit/scene-preview.test.js`

**Interfaces:**
- Consumes: `project.view`(含 `selectedBuildingId`, `editorMode`)。
- Produces: `deriveScenePreview(view) -> { previewBuildingId, highlightBuildingId }`:
  - `previewBuildingId = view.editorMode==='building' ? view.selectedBuildingId : null`
  - `highlightBuildingId = view.selectedBuildingId && view.editorMode!=='building' ? view.selectedBuildingId : null`

纯函数,node 可测,无 Three.js。这样 main.js/场景层不各自散写派生逻辑。

- [ ] **Step 1: 写失败测试**

```javascript
import { describe, expect, it } from 'vitest';
import { deriveScenePreview } from '../../src/scene/scenePreview.js';

describe('deriveScenePreview', () => {
  it('previews (blueprint) only in building editor mode', () => {
    expect(deriveScenePreview({ selectedBuildingId: 'b1', editorMode: 'building' }))
      .toEqual({ previewBuildingId: 'b1', highlightBuildingId: null });
  });
  it('highlights when selected but not editing params', () => {
    expect(deriveScenePreview({ selectedBuildingId: 'b1', editorMode: 'none' }))
      .toEqual({ previewBuildingId: null, highlightBuildingId: 'b1' });
    expect(deriveScenePreview({ selectedBuildingId: 'b1', editorMode: 'areas' }))
      .toEqual({ previewBuildingId: null, highlightBuildingId: 'b1' });
  });
  it('neither when nothing selected', () => {
    expect(deriveScenePreview({ selectedBuildingId: null, editorMode: 'none' }))
      .toEqual({ previewBuildingId: null, highlightBuildingId: null });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/scene-preview.test.js`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 `src/scene/scenePreview.js`**

```javascript
export function deriveScenePreview(view) {
  const { selectedBuildingId, editorMode } = view;
  return {
    previewBuildingId: editorMode === 'building' ? selectedBuildingId : null,
    highlightBuildingId:
      selectedBuildingId && editorMode !== 'building' ? selectedBuildingId : null
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/scene-preview.test.js`
Expected: PASS(3 用例)。

- [ ] **Step 5: 提交**

```bash
git add src/scene/scenePreview.js tests/unit/scene-preview.test.js
git commit -m "feat: derive scene preview/highlight ids from editor mode"
```

---

### Task 3: 场景高亮材质 + 同步器签名 + main.js 接线

**Files:**
- Modify: `src/scene/buildingMesh.js`
- Modify: `src/scene/syncScene.js`
- Modify: `src/scene/createSceneController.js`
- Modify: `src/main.js`
- Test: `tests/unit/scene-sync.test.js`

**Interfaces:**
- Consumes: `deriveScenePreview`(Task 2);现有 `createBuildingMesh(building, { preview })`。
- Produces:
  - `createBuildingMesh(building, { preview=false, highlighted=false })`:`highlighted && !preview` 时用高亮材质(实体色 + `emissive` 微发光),并置 `group.userData.highlighted=true`。preview 优先于 highlight。
  - `synchronizer.update(buildings, { previewBuildingId, highlightBuildingId })`:签名 `${revision}:${preview}:${highlight}`;rebuild 收 `{ preview, highlighted }`。
  - `sceneController.updateProject(project)`:内部用 `deriveScenePreview(project.view)` 得到两个 id 传给 synchronizer。

- [ ] **Step 1: 写失败测试(scene-sync)**

在 `tests/unit/scene-sync.test.js` 追加:

```javascript
import { deriveScenePreview } from '../../src/scene/scenePreview.js';

describe('selection highlight', () => {
  it('rebuilds with highlight material when selected but not editing', () => {
    const group = createBuildingMesh(barBuilding, { highlighted: true });
    const solid = group.children.find(c => c.userData.kind === 'building-solid');
    expect(group.userData.highlighted).toBe(true);
    expect(solid.material.emissiveIntensity).toBeGreaterThan(0);
  });

  it('preview takes precedence over highlight', () => {
    const group = createBuildingMesh(barBuilding, { preview: true, highlighted: true });
    expect(group.userData.preview).toBe(true);
    expect(group.userData.highlighted).toBe(false);
  });

  it('signature includes highlight so highlight toggles rebuild', () => {
    const rebuild = vi.fn((b, opts) => ({ id: b.id, opts, dispose: vi.fn() }));
    const sync = createSceneSynchronizer({ rebuild, attach: vi.fn(), detach: vi.fn() });
    sync.update([barBuilding], { previewBuildingId: null, highlightBuildingId: null });
    sync.update([barBuilding], { previewBuildingId: null, highlightBuildingId: 'building-a' });
    expect(rebuild).toHaveBeenCalledTimes(2);
    expect(rebuild.mock.calls[1][1]).toEqual({ preview: false, highlighted: true });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/scene-sync.test.js`
Expected: FAIL(highlighted 选项/签名未实现)。

- [ ] **Step 3: 实现**

`buildingMesh.js`:加高亮材质常量并在选择材质时分支。

```javascript
const highlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xa9b2b2,
  roughness: 0.82,
  metalness: 0.02,
  emissive: 0x2f6d86,
  emissiveIntensity: 0.35
});
```
`createBuildingMesh(building, { preview = false, highlighted = false } = {})` 里,材质选择:
```javascript
  const material = preview ? blueprintMaterial : (highlighted ? highlightMaterial : buildingMaterial);
  const solid = new THREE.Mesh(geometry, material);
```
`group.userData.preview = preview;` 之后加 `group.userData.highlighted = !preview && highlighted;`

`syncScene.js`:`update(buildings, { previewBuildingId = null, highlightBuildingId = null } = {})`;循环内:
```javascript
        const preview = building.id === previewBuildingId;
        const highlighted = building.id === highlightBuildingId;
        const signature = `${building.revision ?? 0}:${preview}:${highlighted}`;
        ...
        const object = rebuild(building, { preview, highlighted });
```

`createSceneController.js`:`updateProject(project)` 内改为:
```javascript
    updateProject(project) {
      const { previewBuildingId, highlightBuildingId } = deriveScenePreview(project.view);
      synchronizer.update(project.buildings, { previewBuildingId, highlightBuildingId });
      canvas.dataset.buildingCount = String(project.buildings.length);
      canvas.dataset.editingBuildingId = previewBuildingId ?? '';
    },
```
顶部 import `deriveScenePreview`。

`main.js`:picking 的 `onSelect` 改为 `store.execute(createSelectBuildingCommand(buildingId))`(去掉 `{ editing: true }`)。autosave 里读 `project.view.editingBuildingId` 的判断(`prevEditingId` 那段防抖逻辑)改读 `project.view.editorMode`:把 `const currentEditingId = project.view.editingBuildingId;` 改为 `const currentEditing = project.view.editorMode === 'building';` 并相应把 `prevEditingId`→`prevEditing` 布尔化(语义:退出 building 编辑时立即存盘)。

- [ ] **Step 4: 运行确认通过 + 构建**

Run: `npx vitest run tests/unit/scene-sync.test.js tests/unit/scene-preview.test.js` → PASS
Run: `npm run build` → 成功。

- [ ] **Step 5: 全套回归**

Run: `npm test`
Expected: 命令层 + 场景层绿。inspector/app-shell 若仍红,属 Task 5/6 迁移范围。

- [ ] **Step 6: 提交**

```bash
git add src/scene/buildingMesh.js src/scene/syncScene.js src/scene/createSceneController.js src/main.js tests/unit/scene-sync.test.js
git commit -m "feat: add selection highlight material driven by editor mode"
```

---

### Task 4: BuildingOverview 概览卡片(A)

**Files:**
- Create: `src/features/buildings/BuildingOverview.js`
- Test: `tests/unit/building-overview.test.js`

**Interfaces:**
- Consumes: `createElement`;`createSetEditorModeCommand`, `createRemoveBuildingCommand`(Task 1);`BUILDING_TEMPLATES`(`domain/buildings/templates.js`,含 `.label`)。
- Produces: `createBuildingOverview({ store, confirmDelete }) -> { element, update(building) }`:
  - 只读摘要:名称、模板 label、长×深、楼层×层高、旋转、观察区数(`building.observationAreas?.length ?? 0`)、窗数(`building.openings?.length ?? 0`)。
  - 按钮:「编辑建筑」→ `store.execute(createSetEditorModeCommand('building'))`;「观察区与窗」→ `createSetEditorModeCommand('areas')`;「删除建筑」→ `confirmDelete(building) && store.execute(createRemoveBuildingCommand(building.id))`。
  - `update(building)` 刷新只读数字(供选中切换时复用同一元素)。
  - `data-testid`:根 `building-overview`;按钮 `overview-edit-building` / `overview-edit-areas` / `overview-delete`。

- [ ] **Step 1: 写失败测试(jsdom)**

```javascript
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createBuildingOverview } from '../../src/features/buildings/BuildingOverview.js';

function building(over = {}) {
  return {
    id: 'b1', name: '住宅 1', template: 'bar', rotation: 0,
    params: { length: 60, depth: 18, floors: 33, floorHeight: 3 },
    observationAreas: [{ id: 'a1' }], openings: [{ id: 'o1' }, { id: 'o2' }],
    ...over
  };
}

describe('BuildingOverview', () => {
  it('shows a read-only summary with area and opening counts', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createBuildingOverview({ store, confirmDelete: () => true });
    update(building());
    expect(element.textContent).toContain('一字型');
    expect(element.textContent).toContain('住宅 1');
    expect(element.textContent).toMatch(/观察区[^0-9]*1/);
    expect(element.textContent).toMatch(/窗[^0-9]*2/);
  });

  it('enters building editor mode on 编辑建筑', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createBuildingOverview({ store, confirmDelete: () => true });
    update(building());
    element.querySelector('[data-testid="overview-edit-building"]').click();
    expect(store.execute).toHaveBeenCalledTimes(1);
    expect(store.execute.mock.calls[0][0].label).toBe('切换编辑模式');
  });

  it('enters areas editor mode on 观察区与窗', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createBuildingOverview({ store, confirmDelete: () => true });
    update(building());
    element.querySelector('[data-testid="overview-edit-areas"]').click();
    expect(store.execute).toHaveBeenCalledTimes(1);
  });

  it('deletes only after confirm', () => {
    const store = { execute: vi.fn() };
    const confirmDelete = vi.fn(() => false);
    const { element, update } = createBuildingOverview({ store, confirmDelete });
    update(building());
    element.querySelector('[data-testid="overview-delete"]').click();
    expect(confirmDelete).toHaveBeenCalled();
    expect(store.execute).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/building-overview.test.js`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 `BuildingOverview.js`**

```javascript
import { BUILDING_TEMPLATES } from '../../domain/buildings/templates.js';
import { createSetEditorModeCommand, createRemoveBuildingCommand } from '../../store/buildingCommands.js';
import { createElement } from '../../ui/createElement.js';

export function createBuildingOverview({ store, confirmDelete = () => true }) {
  const title = createElement('h2', { className: 'panel__title', testId: 'overview-title' });
  const summary = createElement('dl', { className: 'metric-list' });
  const editBuilding = createElement('button', {
    className: 'button button--primary', text: '编辑建筑',
    testId: 'overview-edit-building', attributes: { type: 'button', 'data-primary-control': '' }
  });
  const editAreas = createElement('button', {
    className: 'button button--secondary', text: '观察区与窗',
    testId: 'overview-edit-areas', attributes: { type: 'button' }
  });
  const remove = createElement('button', {
    className: 'button button--danger', text: '删除建筑',
    testId: 'overview-delete', attributes: { type: 'button' }
  });

  let current = null;
  editBuilding.addEventListener('click', () => store.execute(createSetEditorModeCommand('building')));
  editAreas.addEventListener('click', () => store.execute(createSetEditorModeCommand('areas')));
  remove.addEventListener('click', () => {
    if (current && confirmDelete(current)) store.execute(createRemoveBuildingCommand(current.id));
  });

  const element = createElement(
    'div', { className: 'building-overview', testId: 'building-overview' },
    createElement('div', { className: 'panel__label', text: '建筑概览' }),
    title, summary,
    createElement('div', { className: 'inspector-actions' }, editBuilding, editAreas),
    remove
  );

  function row(term, value) {
    return [createElement('dt', { text: term }), createElement('dd', { text: value })];
  }
  function update(b) {
    current = b;
    title.textContent = b.name;
    const label = BUILDING_TEMPLATES[b.template]?.label ?? b.template;
    summary.replaceChildren(
      ...row('类型', label),
      ...row('长 × 深', `${b.params.length} × ${b.params.depth} 米`),
      ...row('楼层 × 层高', `${b.params.floors} 层 × ${b.params.floorHeight} 米`),
      ...row('旋转', `${b.rotation}°`),
      ...row('观察区', `${b.observationAreas?.length ?? 0} 个`),
      ...row('窗 / 采光口', `${b.openings?.length ?? 0} 个`)
    );
  }
  return { element, update };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/building-overview.test.js`
Expected: PASS(4 用例)。

- [ ] **Step 5: 提交**

```bash
git add src/features/buildings/BuildingOverview.js tests/unit/building-overview.test.js
git commit -m "feat: add read-only building overview hub with explicit editor entries"
```

---

### Task 5: BuildingInspector 改为 (selectedBuildingId, editorMode) 路由（修 bug 核心）

**Files:**
- Modify: `src/features/buildings/BuildingInspector.js`
- Test: Create `tests/unit/building-inspector.test.js`

**Interfaces:**
- Consumes: `createBuildingOverview`(Task 4);`createObservationAreaSection`(现有);`createSetEditorModeCommand`, `createFinishBuildingCommand`, `createCancelAddedBuildingCommand`, `createUpdateBuildingCommand`(Task 1);现有 `numberField`/`validateBuildingField`/`parseBuildingNumber`(保留导出,building-commands.test 引用了后两者)。
- Produces: `createBuildingInspector({ store, confirmDelete }) -> HTMLElement`,按 `(selectedBuildingId, editorMode)` 挂载:
  - 无 `selectedBuildingId` → `element.hidden = true`。
  - `editorMode==='none'` → 概览 A(`createBuildingOverview`)。
  - `editorMode==='building'` → 参数编辑器 B(现有表单,**去掉**观察区区块;顶部加「‹ 返回」→ `createSetEditorModeCommand('none')`;底部「完成」/「取消本次添加」不变)。
  - `editorMode==='areas'` → 观察区 C(`createObservationAreaSection`;顶部「‹ 返回」)。
  - 渲染 key = `${selectedBuildingId}:${editorMode}`;key 不变时:B 表单自管(不重建,保输入焦点);C 调 `areaSection.update(building)`;A 调 `overview.update(building)`;key 变则整块重建。

- [ ] **Step 1: 写失败测试(jsdom)——直击 bug**

```javascript
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createBuildingInspector } from '../../src/features/buildings/BuildingInspector.js';
import {
  createAddBuildingCommand, createFinishBuildingCommand,
  createSelectBuildingCommand, createSetEditorModeCommand
} from '../../src/store/buildingCommands.js';

function mount() {
  const store = createStore(createDefaultProject());
  const el = createBuildingInspector({ store, confirmDelete: () => true });
  document.body.append(el);
  return { store, el };
}
const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);
const hasText = (el, t) => el.textContent.includes(t);

describe('BuildingInspector routing', () => {
  it('hidden when nothing selected', () => {
    const { el } = mount();
    expect(el.hidden).toBe(true);
  });

  it('add building shows the params editor, not the overview or area section', () => {
    const { store, el } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(el.hidden).toBe(false);
    expect(q(el, 'building-overview')).toBeNull();
    expect(hasText(el, '完成')).toBe(true);
  });

  // THE BUG: single building, add -> finish -> overview must expose the areas entry
  it('after add then finish, a single building shows the overview with an areas entry', () => {
    const { store, el } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createFinishBuildingCommand('b1'));
    expect(q(el, 'building-overview')).not.toBeNull();
    expect(q(el, 'overview-edit-areas')).not.toBeNull();
  });

  it('overview -> areas shows the area section and not the params form; back returns to overview', () => {
    const { store, el } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createFinishBuildingCommand('b1'));
    store.execute(createSetEditorModeCommand('areas'));
    expect(q(el, 'building-overview')).toBeNull();
    expect(hasText(el, '观察区域')).toBe(true);         // ObservationAreaSection header
    expect(q(el, 'inspector-back')).not.toBeNull();
    q(el, 'inspector-back').click();
    expect(q(el, 'building-overview')).not.toBeNull();
  });

  it('building editor and area section never appear at the same time', () => {
    const { store, el } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));   // building mode
    expect(hasText(el, '观察区域')).toBe(false);
    store.execute(createFinishBuildingCommand('b1'));
    store.execute(createSetEditorModeCommand('areas'));      // areas mode
    expect(hasText(el, '建筑长度（米）')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/building-inspector.test.js`
Expected: FAIL(现路由未实现;`building-overview`/`inspector-back` 不存在)。

- [ ] **Step 3: 重写 `createBuildingInspector`(第 64 行起的函数体)**

保留文件顶部 `TEMPLATE_DEFAULTS`、`parseBuildingNumber`、`validateBuildingField`、`numberField` 不变；import 增加 `createBuildingOverview` 和 `createSetEditorModeCommand`。函数体改为:

```javascript
export function createBuildingInspector({ store, confirmDelete = () => true }) {
  const element = createElement('aside', {
    className: 'inspector panel building-inspector', testId: 'building-inspector'
  });
  const overview = createBuildingOverview({ store, confirmDelete });
  let renderKey = null;
  let areaSection = null;

  const updateBuilding = (id, patch) => store.execute(createUpdateBuildingCommand(id, patch));

  function backButton() {
    const back = createElement('button', {
      className: 'button button--ghost', text: '‹ 返回', testId: 'inspector-back',
      attributes: { type: 'button' }
    });
    back.addEventListener('click', () => store.execute(createSetEditorModeCommand('none')));
    return back;
  }

  function renderParamsEditor(project, building) {
    const editorPosition = scenePositionToEditor(building.position);
    const templateSelect = createElement('select', {
      className: 'input', attributes: { 'aria-label': '建筑类型' }
    });
    for (const [value, definition] of Object.entries(BUILDING_TEMPLATES)) {
      const option = createElement('option', { text: definition.label, attributes: { value } });
      if (value === building.template) option.setAttribute('selected', '');
      templateSelect.append(option);
    }
    templateSelect.addEventListener('change', () => {
      const defaults = TEMPLATE_DEFAULTS[templateSelect.value] ?? {};
      updateBuilding(building.id, {
        template: templateSelect.value,
        params: { ...defaults, floors: building.params.floors, floorHeight: building.params.floorHeight }
      });
      renderKey = null;
      render(store.getState());
    });

    const finish = createElement('button', {
      className: 'button button--primary', text: '完成',
      attributes: { type: 'button', 'data-primary-control': '' }
    });
    finish.addEventListener('click', () => store.execute(createFinishBuildingCommand(building.id)));

    const removeBtn = createElement('button', {
      className: 'button button--danger',
      text: project.view.addingBuildingId === building.id ? '取消本次添加' : '删除建筑',
      attributes: { type: 'button' }
    });
    removeBtn.addEventListener('click', () => {
      if (project.view.addingBuildingId === building.id) {
        store.execute(createCancelAddedBuildingCommand(building.id));
      } else if (confirmDelete(building)) {
        store.execute(createRemoveBuildingCommand(building.id));
      }
    });

    element.replaceChildren(
      backButton(),
      createElement('div', { className: 'panel__label', text: '建筑参数' }),
      createElement('h2', { className: 'panel__title', text: building.name }),
      createElement('label', { className: 'field' },
        createElement('span', { className: 'field__label', text: '建筑类型' }), templateSelect),
      createElement('div', { className: 'coordinate-fields' },
        numberField({ label: 'X 坐标（东为正）', field: 'x', value: editorPosition.x,
          onValid: x => updateBuilding(building.id, { position: { x } }) }),
        numberField({ label: 'Y 坐标（北为正）', field: 'y', value: editorPosition.y,
          onValid: y => updateBuilding(building.id, { position: { z: y } }) })),
      numberField({ label: '建筑长度（米）', field: 'length', value: building.params.length,
        onValid: length => updateBuilding(building.id, { params: { length } }) }),
      numberField({ label: '建筑进深（米）', field: 'depth', value: building.params.depth,
        onValid: depth => updateBuilding(building.id, { params: { depth } }) }),
      numberField({ label: '楼层数', field: 'floors', value: building.params.floors,
        onValid: floors => updateBuilding(building.id, { params: { floors } }) }),
      numberField({ label: '标准层高（米）', field: 'floorHeight', value: building.params.floorHeight,
        onValid: floorHeight => updateBuilding(building.id, { params: { floorHeight } }) }),
      numberField({ label: '旋转角度（顺时针）', field: 'rotation', value: building.rotation,
        onValid: rotation => updateBuilding(building.id, { rotation }) }),
      createElement('div', { className: 'inspector-actions' }, finish, removeBtn)
    );
  }

  function render(project) {
    const building = project.buildings.find(b => b.id === project.view.selectedBuildingId);
    element.hidden = !building;
    if (!building) { renderKey = null; areaSection = null; element.replaceChildren(); return; }
    const mode = project.view.editorMode;
    const key = `${building.id}:${mode}`;

    if (key === renderKey) {
      if (mode === 'areas' && areaSection) areaSection.update(building);
      else if (mode === 'none') overview.update(building);
      // mode==='building': 表单自管，保输入焦点
      return;
    }
    renderKey = key;
    areaSection = null;

    if (mode === 'building') {
      renderParamsEditor(project, building);
    } else if (mode === 'areas') {
      areaSection = createObservationAreaSection({ buildingId: building.id, building, store });
      element.replaceChildren(backButton(), areaSection.element);
    } else {
      overview.update(building);
      element.replaceChildren(overview.element);
    }
  }

  store.subscribe(render);
  render(store.getState());
  return element;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/building-inspector.test.js`
Expected: PASS(5 用例,含 add→finish→areas 的 bug 回归)。

- [ ] **Step 5: 全套回归**

Run: `npm test`
Expected: 全绿(若 app-shell 相关红,Task 6 处理)。

- [ ] **Step 6: 提交**

```bash
git add src/features/buildings/BuildingInspector.js tests/unit/building-inspector.test.js
git commit -m "feat: route inspector by editor mode, fixing single-building area access"
```

---

### Task 6: AppShell 右栏显隐 + 移动端切 tab 按新模型

**Files:**
- Modify: `src/features/shell/AppShell.js`
- Test: Create `tests/unit/app-shell.test.js`

**Interfaces:**
- Consumes: 现有 `createAppShell({ store, simulationController, onAddBuilding, onClearSandbox, confirmDeleteBuilding })`。
- Produces: 行为变化——
  - 右栏 `updateInspector`:保持"有 `selectedBuildingId` → 显示 inspector、隐藏结果面板;无 → 反之"(概览/编辑器都在 inspector 内,故仍按 selectedBuildingId 判显隐,无需改)。
  - 移动端自动切 tab:改按 `selectedBuildingId` 出现/消失驱动(不再按 editingBuildingId)。`null→有` → `dataset.mobilePanel='editor'`;`有→null` → `'buildings'`。editorMode 在选中态内变化不改 tab(A/B/C 同属 editor tab)。

- [ ] **Step 1: 写失败测试(jsdom)**

```javascript
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createSimulationController } from '../../src/features/results/createSimulationController.js';
import { createAppShell } from '../../src/features/shell/AppShell.js';
import { createAddBuildingCommand, createSelectBuildingCommand, createClearBuildingsCommand, createFinishBuildingCommand, createSetEditorModeCommand } from '../../src/store/buildingCommands.js';

function mount() {
  const store = createStore(createDefaultProject());
  const simulationController = createSimulationController(store);
  const shell = createAppShell({
    store, simulationController,
    onAddBuilding: () => store.execute(createAddBuildingCommand({ id: 'b1' })),
    onClearSandbox: () => store.execute(createClearBuildingsCommand()),
    confirmDeleteBuilding: () => true
  });
  document.body.append(shell);
  return { store, shell };
}
const testid = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('AppShell inspector vs results', () => {
  it('shows results panel when nothing selected, inspector when selected', () => {
    const { store, shell } = mount();
    expect(testid(shell, 'results-panel').hidden).toBe(false);
    expect(testid(shell, 'building-inspector').hidden).toBe(true);
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(testid(shell, 'building-inspector').hidden).toBe(false);
    expect(testid(shell, 'results-panel').hidden).toBe(true);
  });

  it('switches mobile panel to editor on selection and back to buildings on clear', () => {
    const { store, shell } = mount();
    expect(shell.dataset.mobilePanel).toBe('buildings');
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(shell.dataset.mobilePanel).toBe('editor');
    store.execute(createFinishBuildingCommand('b1'));
    store.execute(createSetEditorModeCommand('areas'));      // still editor tab
    expect(shell.dataset.mobilePanel).toBe('editor');
    store.execute(createClearBuildingsCommand());            // selection cleared
    expect(shell.dataset.mobilePanel).toBe('buildings');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/app-shell.test.js`
Expected: FAIL(移动端 tab 逻辑仍按 editingBuildingId,`createSelectBuildingCommand` 旧签名等)。

- [ ] **Step 3: 实现**

在 `AppShell.js` 中,把那段:
```javascript
  let prevEditingId = store.getState().view.editingBuildingId;
  store.subscribe(project => {
    const currentEditingId = project.view.editingBuildingId;
    if (currentEditingId && !prevEditingId) {
      appShell.dataset.mobilePanel = 'editor';
    } else if (!currentEditingId && prevEditingId) {
      appShell.dataset.mobilePanel = 'buildings';
    }
    prevEditingId = currentEditingId;
  });
```
替换为(按 selectedBuildingId 出现/消失):
```javascript
  let prevSelectedId = store.getState().view.selectedBuildingId;
  store.subscribe(project => {
    const currentSelectedId = project.view.selectedBuildingId;
    if (currentSelectedId && !prevSelectedId) {
      appShell.dataset.mobilePanel = 'editor';
    } else if (!currentSelectedId && prevSelectedId) {
      appShell.dataset.mobilePanel = 'buildings';
    }
    prevSelectedId = currentSelectedId;
  });
```
`updateInspector` 无需改动(仍按 `selectedBuildingId` 判显隐)。

- [ ] **Step 4: 运行确认通过 + 全套回归**

Run: `npx vitest run tests/unit/app-shell.test.js` → PASS
Run: `npm test` → 全绿。

- [ ] **Step 5: 提交**

```bash
git add src/features/shell/AppShell.js tests/unit/app-shell.test.js
git commit -m "feat: drive right panel and mobile tab by selection under editor modes"
```

---

### Task 7: 移除 editingBuildingId 镜像 + e2e + 验证

**Files:**
- Modify: `src/domain/project/defaultProject.js`
- Modify: `src/store/buildingCommands.js`
- Modify: `src/scene/createSceneController.js`(dataset 名)
- Modify: 任何仍引用 `editingBuildingId` 的测试
- Create: `tests/e2e/edit-modes.spec.js`

**Interfaces:**
- Produces: 代码库中不再有 `editingBuildingId` 作为状态字段;`deriveEditing` helper 删除;命令直接返回 `view`(不再包镜像)。

- [ ] **Step 1: 找出所有残留引用**

Run: `grep -rn "editingBuildingId" src tests`
Expected: 列出 `defaultProject.js`、`buildingCommands.js`(deriveEditing)、`createSceneController.js`(`canvas.dataset.editingBuildingId`)、可能的测试断言。逐个处理:
- `defaultProject.js`:删 `editingBuildingId: null,` 行(保留 `editorMode: 'none'`)。
- `buildingCommands.js`:删 `deriveEditing` 函数;把各命令 `view: deriveEditing({...})` 改为 `view: {...}`(直接返回,不再镜像)。
- `createSceneController.js`:`canvas.dataset.editingBuildingId = previewBuildingId ?? ''` 改为 `canvas.dataset.previewBuildingId = previewBuildingId ?? ''`(dataset 更名,语义对齐)。
- 任何测试里 `editingBuildingId` 断言:改为断言 `editorMode`。

Run 后:`grep -rn "editingBuildingId" src` 应无输出。

- [ ] **Step 2: 全套单测回归**

Run: `npm test`
Expected: 全绿(此时 `editingBuildingId` 已从状态与断言中清除)。若红,是某处断言/读取残留,回到 Step 1 补。

- [ ] **Step 3: 写 e2e `tests/e2e/edit-modes.spec.js`**

```javascript
import { expect, test } from '@playwright/test';

test('single building: explicit modes, select does not auto-edit', async ({ page }) => {
  await page.goto('/');

  // 添加建筑 → 进入参数编辑器（有“完成”）
  await page.getByRole('button', { name: '添加建筑' }).click();
  await expect(page.getByRole('button', { name: '完成' })).toBeVisible();

  // 完成 → 概览（分岔口，含“观察区与窗”入口）
  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
  await expect(page.getByTestId('overview-edit-areas')).toBeVisible();

  // 进入“观察区与窗” → 出现观察区编辑，返回回到概览
  await page.getByTestId('overview-edit-areas').click();
  await expect(page.getByTestId('building-overview')).toHaveCount(0);
  await expect(page.getByText('观察区域')).toBeVisible();
  await page.getByTestId('inspector-back').click();
  await expect(page.getByTestId('building-overview')).toBeVisible();

  // 概览点“编辑建筑” → 参数表单
  await page.getByTestId('overview-edit-building').click();
  await expect(page.getByLabel('建筑长度（米）')).toBeVisible();
});
```

- [ ] **Step 4: 校验 e2e 解析(本环境无法跑浏览器)**

Run: `npx playwright test edit-modes.spec.js --list`
Expected: 列出 desktop + mobile 两 project 下该用例,解析无语法错误。运行留待有 Playwright 浏览器的机器(`npm run test:e2e`)。

- [ ] **Step 5: 交付前全量验证**

Run: `npm test` → 全绿;`npm run build` → 成功。

- [ ] **Step 6: 提交**

```bash
git add src/domain/project/defaultProject.js src/store/buildingCommands.js src/scene/createSceneController.js tests/ 
git commit -m "refactor: remove editingBuildingId mirror, add explicit edit-mode e2e"
```

## Self-Review

- **Spec 覆盖**:选中≠编辑→Task 1(命令)+Task 5(路由);概览分岔口→Task 4;两互斥编辑器不同屏→Task 5(测试断言);单栋 bug→Task 5(add→finish→areas 回归);场景高亮 vs 蓝图→Task 2+3;移动端映射→Task 6;`editingBuildingId`→`editorMode` 替换→Task 1(引入)+Task 7(移除镜像)。验收标准逐条有归属。
- **Placeholder 扫描**:无 TBD/TODO;每个改代码步骤含完整代码块;e2e 运行限制已显式标注。
- **类型一致**:`editorMode` 三值 `'none'|'building'|'areas'` 全任务一致;`createSetEditorModeCommand`/`createSelectBuildingCommand(id)`(单参)/`deriveScenePreview`/`createBuildingOverview({store,confirmDelete})→{element,update}` 在定义(1/2/4)与消费(3/5/6)间签名一致;`syncScene.update(buildings,{previewBuildingId,highlightBuildingId})` 与 `createBuildingMesh(b,{preview,highlighted})` 在 Task 3 内自洽,`createSceneController` 消费一致;`data-testid`:`building-overview`/`overview-edit-building`/`overview-edit-areas`/`overview-delete`/`inspector-back` 在 Task 4/5/7 一致。
- **迁移安全**:Task 1 引入镜像使旧消费者存活;Task 3/5/6 迁移 main/scene/inspector/shell;Task 7 才移除镜像——每步 `npm test` 全绿,无中间破损提交。





