# 观察区创建/编辑流程重设计 — 设计

日期：2026-07-08
状态：待实现

## 背景

上一版 top-down 观察区编辑把内部数据模型直接暴露给用户：先创建一个空的 `observationArea`，再让用户在这个对象上选楼层、填名称、画 rects、应用草稿。实际试用证明这个心智模型不成立：用户看到「观察区 1」下拉会以为已经创建完成；又看到拖拽和输入框并存，不知道哪一步才算确认；也感受不到该观察区和当前建筑之间的明确绑定。

本设计废弃「先创建空观察区对象」的流程，改成更符合用户心智的任务流：**我正在为这栋建筑的某一层创建/编辑一个采光分析区域，保存后才写入项目数据。**

## 核心判断

当前体验不好，不应继续靠隐藏下拉、补文案、调按钮来修。根因是创建生命周期错了：

- 错误模型：先创建空 `observationArea` → 再补楼层/名称/rects → 再应用草稿。
- 正确模型：先进入创建会话 → 选楼层、拖拽画区域、可选命名 → **保存时才创建 `observationArea`**。

用户不需要理解 `observationAreas`、`areaDraft`、`activeAreaId` 这些内部概念。界面应该表达任务，而不是对象存储结构。

## 设计目标

1. **没有空观察区对象**：点击「新建观察区」只进入创建会话，不立即写入 `building.observationAreas`。
2. **保存才算添加**：只有点击「保存观察区」后，列表里才出现该观察区，结果才以它为正式输入。
3. **建筑绑定显性化**：观察区编辑页始终显示「当前建筑：<建筑名>」，创建/编辑操作都明确绑定这栋建筑。
4. **流程单线化**：新建时只暴露必要步骤：楼层 → 拖拽画区 → 名称可选 → 保存。不要同时暴露下拉、对象选择、草稿应用等多套确认机制。
5. **编辑和新建区分**：新建默认只画；编辑已有观察区时才有继续添加/擦除/重新绘制。
6. **保留已有 top-down 优点**：进入编辑时仍聚焦当前楼层，只显示当前层轮廓/地板/选区，隐藏建筑实体。

## 非目标

- 不改采光算法。
- 不改正式数据模型：保存后的观察区仍是 `{ id, name, floor, rects, sampleHeight }`。
- 不做手动窗编辑；采光口仍由观察区跨外墙自动派生。
- 不引入新框架或新依赖。

## 信息架构

### 1. 建筑概览入口

概览按钮从「观察区与窗」改为更明确的：

> 设置采光观察区

进入后，面板顶部显示：

```text
采光观察区
当前建筑：1号楼
```

这解决「观察区是不是绑定到建筑」的问题。

### 2. 观察区首页（list/empty state）

观察区编辑页不是表单，也不是下拉。它是当前建筑的观察区管理首页。

#### 没有观察区

```text
采光观察区
当前建筑：1号楼

还没有观察区
为这栋建筑选择一个楼层，并在平面图上画出要分析采光的房间/区域。

[ 新建观察区 ]
```

不显示下拉，不显示「观察区 1」，不显示名称/楼层输入框。

#### 已有观察区

```text
采光观察区
当前建筑：1号楼

已有观察区
┌ 客厅 · 1层 · 18㎡        [编辑] [删除] ┐
└ 卧室 · 2层 · 12㎡        [编辑] [删除] ┘

[ 新建观察区 ]
```

列表/卡片比下拉更适合这个场景：观察区数量少，用户需要看见「它们已经存在」。

## 创建流程

点击「新建观察区」进入创建会话，不写入项目数据。

### 创建会话状态

```js
view.areaEditing = {
  mode: 'create',
  buildingId,
  areaId: null,
  floor: 1,
  name: '',
  rects: [],
  tool: 'draw'
}
```

此状态是 view 层临时状态。它不属于正式项目数据，退出/取消时丢弃。

### 创建页面初始态

```text
新建观察区
当前建筑：1号楼

1. 选择楼层
[ 1 ▼ ]

2. 在平面图上拖拽画出观察区
状态：尚未绘制

[取消] [保存观察区]  ← 保存按钮禁用
```

进入这个页面时，3D 场景立刻切到当前建筑第 1 层 top-down 视图。用户左键/单指拖拽即可画区域。

### 绘制后

```text
新建观察区
当前建筑：1号楼

楼层：1层
已绘制：1块，约 18㎡

名称（可选）
[ 客厅 ]

[重新绘制] [保存观察区]
```

- `重新绘制` 清空 `areaEditing.rects`，保持楼层和名称。
- `保存观察区` 创建正式 observationArea：
  - id：新 UUID。
  - name：用户填的名称；为空时使用 `观察区 N`。
  - floor：`areaEditing.floor`。
  - rects：`areaEditing.rects`。
  - sampleHeight：0。
- 保存后退出创建会话，回到观察区首页，并在列表中展示新卡片。

## 编辑流程

点击已有卡片的「编辑」进入编辑会话。

### 编辑会话状态

```js
view.areaEditing = {
  mode: 'edit',
  buildingId,
  areaId,
  floor: area.floor,
  name: area.name,
  rects: structuredClone(area.rects ?? []),
  tool: 'draw'
}
```

编辑会话基于正式 area 克隆，保存前不改正式 area。

### 编辑页面

```text
编辑观察区：客厅
当前建筑：1号楼

楼层：[1 ▼]
名称：[客厅]

已绘制：2块，约 24㎡
[继续添加] [擦除] [重新绘制]

[取消修改] [保存修改]
```

- `继续添加`：tool = draw。
- `擦除`：tool = erase。
- `重新绘制`：清空 rects，tool = draw。
- `取消修改`：丢弃 `areaEditing`，回到首页。
- `保存修改`：写回该 area 的 `name/floor/rects`，退出会话。

新建时不显示「擦除」；编辑时才显示。

## 场景交互

### 聚焦时机

- 进入 `areaEditing`（create/edit）时进入 floor focus。
- `areaEditing.floor` 变化时，更新 floor focus 到新楼层。
- 退出 `areaEditing` 时退出 floor focus。

### 绘制行为

- create/edit 会话中的拖拽只更新 `view.areaEditing.rects`，不写入 `building.observationAreas`。
- 场景 overlay 渲染 `areaEditing.rects`，样式明确为「编辑中」：半透明 + 边界线。
- 保存后，正式 area 渲染为生效样式。

### 点击穿透

在 floor focus / areaEditing 中，场景点击不触发建筑选择，避免拖拽后回到建筑视图。

## Store / 命令设计

替换当前 `areaDraft` 为更明确的 `areaEditing`。

### view 状态

```js
view: {
  ...,
  areaEditing: null
}
```

### 命令

新增/替换命令：

- `createStartAreaCreateCommand(buildingId)`
  - 设置 `view.editorMode = 'areas'`。
  - 设置 `view.areaEditing = { mode:'create', buildingId, areaId:null, floor:1, name:'', rects:[], tool:'draw' }`。
- `createStartAreaEditCommand(buildingId, areaId)`
  - 从该 building 的 area 克隆数据到 `view.areaEditing`。
- `createUpdateAreaEditingCommand(patch)`
  - patch `floor/name/rects/tool`。
- `createCancelAreaEditingCommand()`
  - 清空 `view.areaEditing`，保留 `editorMode:'areas'`，回到首页。
- `createSaveAreaEditingCommand()`
  - `mode:'create'`：添加 observationArea。
  - `mode:'edit'`：更新现有 observationArea。
  - 保存后清空 `view.areaEditing`，保留 `editorMode:'areas'`。
- `createExitAreasCommand()` 或复用返回按钮：退出 areas 时清空 `areaEditing` 并 `editorMode:'none'`。

删除/废弃旧命令：

- `createUpdateAreaDraftCommand`
- `createApplyAreaDraftCommand`
- `createClearAreaDraftCommand`
- `createSetActiveAreaCommand`（观察区首页不再用下拉切 active area；结果面板如仍需 active area，可保留给结果面板，但观察区编辑 UI 不再使用）
- `createSetAreaToolCommand` 可改为 patch `areaEditing.tool`，或由 `createUpdateAreaEditingCommand({ tool })` 代替。

## UI 组件设计

当前 `createAreaFloorTool` 做了太多事，应该拆成小一点的渲染分支，但不需要引入框架。

建议结构：

```js
createAreaPanel({ store, buildingId })
  renderHome(building)
  renderCreateSession(building, areaEditing)
  renderEditSession(building, areaEditing)
```

可以先仍使用同一个文件，内部拆函数，不必过早新建多个文件；若超过 250 行再拆。

### 首页元素 testId

- `area-home`
- `area-building-name`
- `area-empty-hint`
- `area-card-<id>`
- `area-create-start`
- `area-edit-<id>`
- `area-delete-<id>`

### 会话页 testId

- `area-session`
- `area-session-title`
- `area-session-floor`
- `area-session-name`
- `area-tool-draw`
- `area-tool-erase`（仅 edit 且 rects 非空）
- `area-reset-rects`
- `area-cancel`
- `area-save`
- `area-rect-summary`

## 与结果/分析的关系

- 未保存的 `areaEditing` 不参与 `createSimulationController` 的正式采光结果。
- 场景可显示编辑中的 overlay，但结果面板仍以正式 `observationAreas` 为准。
- 保存后可以把 `simulation.activeAreaId` 设为新建/编辑的 area id，使结果面板自然切到该观察区。

## 迁移策略

- 旧项目中的正式 `observationAreas` 保留。
- 旧 `view.areaDraft` / `view.areaTool` 迁移时丢弃或归一：
  - `view.areaEditing = null`
  - 可以删除/忽略 `areaDraft`
  - `areaTool` 可保留到旧代码清理完成后再移除；最终不再需要全局 areaTool。

## 测试策略

### 单元测试

1. `buildingCommands`
   - start create 不添加 area，只设置 `areaEditing`。
   - update editing patch rects/floor/name/tool。
   - save create 才添加 area，并清空 editing。
   - start edit 克隆已有 area。
   - cancel 不修改正式 area。
   - save edit 写回正式 area。

2. `area panel`
   - 无观察区：首页只显示空态 + 新建按钮，不显示下拉/名称输入。
   - 点击新建：进入 create session，保存按钮 disabled 直到 rects 非空。
   - 有观察区：首页显示卡片列表，而不是下拉。
   - 编辑卡片：进入 edit session，名称/楼层/rects 从正式 area 克隆。

3. `scene controller / overlays`
   - 有 `view.areaEditing` 时 overlay 使用 editing rects。
   - 无 editing 时使用正式 active area（如结果面板需要）。
   - floor focus 在 entering/leaving editing session 时正确进入/退出。

### E2E

1. 从建筑概览进入「设置采光观察区」。
2. 确认没有观察区时显示空态，没有「观察区 1」下拉。
3. 点击新建 → 选择楼层 → 拖拽画区 → 保存按钮可用 → 保存。
4. 回到列表，看到新卡片。
5. 点击编辑 → 修改/重绘 → 取消不影响正式卡片；保存才更新。
6. 拖拽后仍停留在观察区会话，不返回建筑视图。

## 验证

- `npm test`
- `npm run build`
- 环境允许时跑 `npx playwright test tests/e2e/area-topdown.spec.js`。

## 开放问题

无。方向已由用户确认：旧流程体验不可接受，需要重设为创建/编辑会话模型。
