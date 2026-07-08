# 观察区编辑体验重做 — 设计

日期：2026-07-08
状态：待实现

## 背景

top-down 观察区编辑（`feat/topdown-area-editing`，已合并 master）落地后，
用户实际试用发现一批交互体验问题。本设计针对这些反馈系统性重做编辑体验，
不改变底层采光算法与 rects 数据模型。

## 目标问题（来自用户反馈）

1. 概览面板里「删除建筑」按钮与「编辑建筑 / 观察区与窗」宽度、间距不一致。
2. 进入观察区后交互别扭：
   1. 「移动」工具多余（效果等同返回建筑视图）。
   2. 选中「画区」后按钮不高亮，看不出当前处于哪个模式。
   3. 没有观察区时仍露出空的黑色下拉框，影响体验。
   4. 画区/建区没有「草稿 vs 生效」的实感，不知道是在画草稿还是已直接生效。
   5. 画选区时没隐藏楼上楼下，选中建筑整栋实心挡住地板，看不到选区。

## 非目标

- 不改采光算法（`evaluateDirectSun` / `deriveApertures` / `rectsToSamplePoints`）。
- 不改 rects 数据模型（仍是 `{x0,z0,x1,z1}` 浮点米矩形）。
- 不做窗/采光口的手动编辑（仍由选区跨外墙自动派生）。

## 设计

### D1. 概览按钮布局一致化（问题 1）

`BuildingOverview` 当前把 `editBuilding` + `editAreas` 放进 `.inspector-actions`
（grid，按钮拉满宽），而 `remove`（删除建筑）作为兄弟节点在 grid 外，button 默认
宽度=内容，导致窄一截且无间距。

**改法**：三个按钮统一进 `.inspector-actions` 布局，同宽、同 8px 间距。
`删除建筑`作为危险操作排在最下，与「参数编辑器」里 `完成 + 删除建筑` 的布局保持一致
（后者已在同一个 grid，是正确参照）。纯 DOM/CSS 调整，无逻辑变化。

### D2. 工具栏简化 + 高亮（问题 2.1、2.2）

- **移除 `move` 工具**。`TOOLS` 仅保留 `['draw','画区']`、`['erase','擦除']`。
- `view.areaTool` 取值收窄为 `'draw' | 'erase'`；`AREA_TOOLS` 白名单同步；
  `defaultProject` 的 `view.areaTool` 保持 `'draw'`。
- **当前工具高亮**：选中的工具按钮加 `.is-active`（复用向导 `.template-card.is-active`
  已有的高亮样式：描边 + 浅底 + 内阴影），同时保留 `aria-pressed` 供无障碍。
- **相机操作**（不再靠工具模式切换）：聚焦时
  - `controls.enableRotate = false`
  - 左键空出给绘制（`mouseButtons.LEFT = -1` / 不绑 orbit）
  - 右键平移（`mouseButtons.RIGHT = PAN`），滚轮缩放（`enableZoom = true`）
  - 触屏：单指绘制（`touches.ONE = -1`），双指缩放/平移（`touches.TWO = DOLLY_PAN`）
  - `controls.enabled` 始终 true（不再随工具开关）。

### D3. 无观察区时的空态（问题 2.3）

`createAreaFloorTool` 增加空态分支：当 `building.observationAreas` 为空时，
**隐藏**观察区下拉、名称、楼层字段，只显示一句引导文案（如「还没有观察区，先新建一个」）
和 `＋新观察区` 按钮。有观察区后显示完整字段。工具栏（画区/擦除）在无激活观察区时也
禁用或隐藏，避免对着空气画。

### D4. 草稿 + 显式确认（问题 2.4）

引入编辑草稿层，让绘制先落草稿、显式「应用」才生效。

- **状态位置**：`view.areaDraft = { buildingId, areaId, rects } | null`（存 store 的
  `view`，与 `editorMode`/`areaTool` 同级）。草稿只写这里，**不碰 `area.rects`**，
  因此不触发 `createSimulationController` 的采光重算。
- **初始化**：首次绘制/擦除某观察区时，若无草稿，则以当前 `area.rects` 的克隆初始化草稿，
  再把本次编辑 `applyRectEdit` 到草稿的 `rects` 上。
- **拖拽预览**：`areaDrag` 增加 `pointermove`，拖拽期间实时画一个半透明预览矩形跟手；
  `pointerup` 把这次编辑派发进草稿（不是直接进 `area.rects`）。
- **渲染**：有草稿时，场景渲染草稿 rects（虚线 / 半透明，示意「未应用」）；
  无草稿时渲染已生效 `area.rects`（实色）。
- **确认 UI**：工具栏底部在有草稿时出现 `撤销草稿` / `应用选区 ✓` 两个按钮，
  外加状态文字：有草稿「● 草稿未应用」，无草稿「✓ 已生效」。
  - `应用选区` → 命令把 `draft.rects` 写入 `area.rects` 并清空 `view.areaDraft`（触发重算）。
  - `撤销草稿` → 命令清空 `view.areaDraft`（回到已生效状态）。
  - 退出观察区（返回 / 切换观察区 / 切建筑）→ 清空草稿，避免脏草稿残留。
- **新增 store 命令**：
  - `createUpdateAreaDraftCommand(buildingId, areaId, rects)` — 写草稿。
  - `createApplyAreaDraftCommand()` — 草稿落定到 `area.rects` 并清草稿。
  - `createClearAreaDraftCommand()` — 清草稿。

### D5. 聚焦只显示当前层（问题 2.5）

- 聚焦时**隐藏选中建筑的实体 mesh**（`sceneParts.buildings` 里该 entityId 的 child
  `visible = false`），这样楼上楼下的实体一并消失。
- 改画：本层高度的**墙体轮廓线**（由 `createFootprint` 外环生成 `LineLoop`，
  置于当前楼层顶/底高度）+ 已有地板网格 slab + 选区 overlay，提供方位与房间轮廓感。
- **邻楼保留实体** mesh，作为遮挡与方位参考（`floorVisibility` 仍隐藏其它建筑？——
  修正为：其它建筑保留可见做参考，只有选中建筑换成轮廓）。
  > 决策：邻楼是否显示影响不大，但用户关心的是「看清自己这层」，邻楼保留实体不遮挡俯视选区，
  > 保留以提供环境参考。
- 退出聚焦：恢复选中建筑实体 `visible = true`，移除轮廓线。

## 架构影响

- `src/store/buildingCommands.js`：`AREA_TOOLS` 去 `move`；新增 3 个草稿命令。
- `src/domain/project/defaultProject.js`：`view` 增加 `areaDraft: null`（保持 `areaTool:'draw'`）。
- `src/domain/project/validateProject.js` / migrate：确保旧项目补 `areaDraft: null`，
  并把遗留的 `areaTool:'move'` 归一到 `'draw'`。
- `src/features/areas/createAreaFloorTool.js`：去 move 工具、加 is-active 高亮、
  空态分支、草稿确认 UI 与状态文字。
- `src/scene/areaDrag.js`：加 `pointermove` 预览、左键判定（`e.button===0`）、
  onCommit 改为派发草稿更新。
- `src/scene/floorFocus.js`：加墙体轮廓 builder；聚焦隐藏选中建筑实体。
- `src/scene/createSceneController.js`：`enterFloorFocus` 配置相机 mouseButtons/touches、
  隐藏选中建筑实体+加轮廓、渲染草稿 vs 生效；`setFloorTool` 不再切 `controls.enabled`。
- `src/scene/observationOverlay.js`：支持 `draft` 样式（虚线/半透明）。
- `src/main.js`：草稿变化驱动场景重画（走已有 `updateProject`/`updateAnalysis` 通路）；
  退出观察区时清草稿。

全程 store 驱动，场景仍不订阅 store、由 main.js 命令式驱动，符合现有架构。

## 测试策略

- 单元：
  - `buildingCommands`：3 个草稿命令 apply 语义 + `areaTool` 白名单去 move。
  - `area-floor-tool`：无观察区空态隐藏字段；工具高亮 is-active；应用/撤销派发正确命令。
  - `area-drag`：pointermove 预览、左键判定、onCommit 派发草稿。
  - `floor-focus`：墙体轮廓 builder；聚焦可见性（选中建筑实体隐藏）。
  - `migrate-project`：旧 `areaTool:'move'` → `'draw'`；补 `areaDraft`。
- e2e（`area-topdown.spec.js` 扩展）：进入观察区 → 画草稿 → 应用 → 出结果；撤销草稿不生效。

## 验证

改动不涉及采光算法数值，验证聚焦「行为」而非数值：现有 `direct-sun` / `analyze-day`
数值测试应保持通过；新增交互测试覆盖草稿→应用链路。`npm test` + `npm run build` 通过为准。
