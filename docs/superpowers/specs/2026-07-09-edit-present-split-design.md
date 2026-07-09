# 编辑/展示 分裂与信息架构 — 设计（Phase A）

日期：2026-07-09
状态：待实现
所属迭代：编辑/展示分裂（A→B→C 三阶段中的 Phase A）

## 背景

当前应用把"建模"和"采光展示"混在一起：底部时间轴始终挂载、`simulationController` 在每次 store 变更时都重算并向场景转发日照，地点硬编码为深圳，左侧栏只有"添加建筑"，观察区只能从右栏 inspector 的面积面板管理且必须起名。用户希望把流程拆成两个明确环节：

- **编辑环节**：放建筑、画观察区。不需要模拟光照，不需要时间/日期。
- **展示环节**：选地点、选时间、看采光。

本轮（Phase A）只做模式分裂与信息架构重构，不动绘制立体化（Phase B）与室内观察（Phase C）。Phase A 必须独立可用：编辑态能干净地建模，展示态能在外部看模型 + 真实日照阴影 + 结果面板，按时间轴/地点驱动。

## 范围与非目标

### 范围

1. 顶层 `view.phase` 模式分裂 + Header「编辑/展示」开关。
2. 编辑态门控：隐藏时间轴、停模拟、场景中性光。
3. 展示态：时间轴 + 结果面板 + 地点选择器，几何编辑锁定。
4. 左侧栏改为 building→area 层级树，"添加建筑""添加观察区"统一在左栏。
5. 观察区去掉命名（移除 `name` 字段与相关 UI/命令），标签派生。
6. 右栏只做参数；观察区首页/列表从右栏移到左树；`createAreaFloorTool` 精简为会话视图。
7. 精简城市选择器，废弃死代码 `LocationEditor.js`。

### 非目标（留给后续阶段）

- Phase B：绘制时的立体楼层切片 + 越界 rect 自动裁剪。
- Phase C：展示态"进入观察区"的室内视角（切窗洞 + 室内几何 + 室内相机 + 真实光影穿透）。
- 不改采光算法（`evaluateDirectSun` / `analyzeDay` 等）。
- 不接全日 worker（`dailyAnalysis.worker.js` 仍未接线，保持现状）。
- 不改导入导出格式以外的数据持久化策略（仅迁移 `view.phase` 与丢弃 `area.name`）。

## 第 1 节：顶层模式分裂与门控

### 状态

新增顶层字段，位于现有 `editorMode`（`'none'|'building'|'areas'`）之上：

```
view.phase : 'edit' | 'present'   // 默认 'edit'
```

`editorMode` 仍只描述"编辑态右栏显示什么"；`phase` 描述"处于哪个环节"。`phase==='present'` 时 `editorMode` 实质无意义（右栏恒为结果面板，几何编辑锁定），但保留字段以简化回切。

### Header 开关

`createHeader`（`src/features/shell/AppShell.js`）增加一个分段开关「编辑 / 展示」。点击派发 `createSetPhaseCommand('edit'|'present')`。

### 编辑态行为

- **时间轴**：`createTimeline` 一次性挂载，由 `phase` 切换显隐（edit 态 `hidden`，present 态可见），避免反复重建控制器接线。
- **模拟停**：`createSimulationController.calculate` 在 `phase==='edit'` 时早退（不计算 solar、不计算 `evaluateDirectSun`、不通知监听者）。`main.js` 的 store 订阅里，`phase==='edit'` 时不调用 `sceneController.updateSolar` / `updateAnalysis`，ResultsPanel 不因 store 变更重算。
- **场景光**：`sunLighting.applySunLighting` 在 `phase==='edit'` 时用一个稳定的中性编辑光（固定方向 + 固定强度、`castShadow` 可关或保留软阴影），不跟太阳位置走。present 态恢复按 `solar.direction` 定位 `DirectionalLight`。
- **几何编辑全开**：添加建筑/观察区、改参数、画区，全部可用。

### 展示态行为

- 时间轴挂载在底部；模拟激活；ResultsPanel 显示。
- 地点选择器出现（第 3 节）。
- **几何编辑锁定**：左树"添加建筑""添加观察区"按钮禁用；建筑参数表单只读或不可进入（点建筑只高亮 + 概览只读，不进 `editorMode='building'`）；观察区不可画/改。点观察区节点在展示态只做"选中查看"（Phase C 才有"进入室内"）。
- Phase A 的展示态 = 外部看模型 + 真实日照阴影 + 时间轴/地点驱动 + 结果面板。

### 切换规则

- edit→present：若无任何观察区（所有建筑 `observationAreas` 皆为空），阻止并提示"请先在编辑态添加观察区"。地点用默认深圳可直接进入，但地点选择器显著展示。
- present→edit：直接切回，不确认。回切时若有展示态临时相机状态（Phase C 才有），重置；Phase A 无需处理。

### 派生与一致性

- `view.phase` 是单一真相源。所有消费者（AppShell、main.js、sunLighting、sim controller、移动端 tab）从 `view.phase` 派生，不各存副本。
- 移动端：edit 态隐藏"模拟/结果"两个 tab；present 态隐藏建筑编辑入口（"建筑" tab 退化为只读浏览）。桌面与移动共用 `view.phase` 与同一套门控逻辑。

## 第 2 节：左侧栏层级树 + 观察区精简

### 左侧栏 `createProjectTree`（`src/features/shell/DesktopShell.js`）

由扁平"添加建筑 + 建筑列表"改为真正的层级树：

```
[ ＋ 添加建筑 ]
▼ 住宅 1                     [ ＋ 观察区 ]
    观察区 1 · 1层
    观察区 2 · 2层
▼ 住宅 2                     [ ＋ 观察区 ]
    观察区 1 · 1层
```

- 顶部"＋ 添加建筑"保留。
- 每个建筑节点：名称 + 展开/折叠 + 节点上的"＋ 观察区"按钮（即 item #1：添加观察区按钮做到左边，与添加建筑统一，归属关系天然可见）。
- 建筑子节点 = 该建筑的 `observationAreas`，标签派生（见下）。
- 点建筑节点 → `createSelectBuildingCommand(id)`（`editorMode='none'`，右栏概览）。
- 点建筑节点上的"＋ 观察区" → `createStartAreaCreateCommand(buildingId)`（设 `selectedBuildingId`、`editorMode='areas'`、`areaEditing` create 会话）。
- 点观察区节点 → `createStartAreaEditCommand(buildingId, areaId)`（进入该区编辑会话）。
- 展示态下"添加建筑""添加观察区"按钮 `disabled`；点观察区只选中查看，不进编辑会话。

### 右栏只做参数（item #1）

观察区**首页/列表/卡片从右栏移除**（归属与列表已由左树承担）。`BuildingInspector` 在 `editorMode='areas'` 时挂载的 `createAreaFloorTool` 精简为只剩"会话视图"：

- 楼层选择（数字输入，clamp 到 `building.params.floors`）。
- 绘制/擦除工具条。
- 已绘面积摘要。
- 保存 / 取消。

不再有首页、不再有"新建观察区"按钮（改由左树触发）、不再有名称输入。

### 去掉命名（item #2）

- 移除会话里的名称输入框。
- 移除 `areaEditing.name`、`createUpdateAreaEditingCommand({ name })` 的 name 分支、保存时空名默认 `观察区 N` 的逻辑。
- **数据模型移除 `name` 字段**：观察区 schema 由 `{ id, name, floor, rects, sampleHeight }` 变为 `{ id, floor, rects, sampleHeight }`。
- 展示标签派生：建筑内 1-based，`观察区 {index+1}`。树节点显示 `观察区 {index+1} · {floor}层`。ResultsPanel 的 area 下拉同样用派生标签。
- 迁移：旧项目 `area.name` 丢弃（migration 中删除该字段），标签改用派生。这是真正的代码精简，不是隐藏。

> 派生标签说明：按数组下标 `index+1`。删除某观察区后编号会重排——可接受（与"不需要稳定身份"一致；分析以 `id` 为准，不以名称为准）。

## 第 3 节：地点选择 + 状态/命令 + 测试

### 精简城市选择器（item #4）

新建 `src/features/location/createLocationPicker.js`：

- 一个城市 `<select>`，预设十余座常见城市（北京/上海/深圳/广州/成都/杭州/重庆/武汉/西安/南京 等），每项带 `{ cityId, lat, lon, timezone, label }`。
- "自定义坐标"展开项：手动经纬度 + 时区输入。
- 选定后 `store.execute(createSetLocationCommand(...))`，复用现有 `domain/solar`（已读 `project.location`）。
- 展示态显示在时间轴旁的控制条；edit 态不显示。
- 废弃死代码 `src/features/location/LocationEditor.js`（删除）。`src/main.js:136` 读 `location.cityId` 做截图水印的逻辑改为读 `location.label` 或保留 `cityId`（自定义坐标时 `cityId` 可为 `'custom'`，水印用 `label`）。

预设城市表与默认深圳一致：默认项目地点保持深圳，确保展示态一进入即可用，地点选择器仅用于修改。

### 新增/改动命令与状态

- `src/domain/project/defaultProject.js`：`view` 增加 `phase: 'edit'`。地点默认深圳保持不变。
- `src/domain/project/` 迁移：旧项目补 `view.phase = 'edit'`；删除 `observationAreas[*].name`。
- `src/domain/project/validateProject.js`：观察区 schema 去 `name`；`view.phase` 枚举校验。
- `src/store/commands.js` 或 `buildingCommands.js`：
  - 新增 `createSetPhaseCommand('edit'|'present')`。
  - 新增 `createSetLocationCommand({ cityId, lat, lon, timezone, label })`。
  - `createSaveAreaEditingCommand`：不再写 `name`。
  - `createStartAreaEditCommand`：不再克隆 `name`。
  - `createUpdateAreaEditingCommand`：移除 `name` patch 分支。
  - `createAddObservationAreaCommand` / `createUpdateObservationAreaCommand`：去 `name`。
- `src/domain/buildings/areaEditing.js`：`createAreaEditingSession` 去 `name`。
- `src/features/areas/createAreaFloorTool.js`：删首页/卡片/名称输入；会话由外部（左树）触发；`sync()` 只渲染会话视图。
- `src/features/shell/DesktopShell.js` `createProjectTree`：层级树 + 每建筑"＋ 观察区" + 展示态禁用。
- `src/features/shell/AppShell.js`：
  - Header 增「编辑/展示」开关。
  - `updateInspector`：`phase==='present'` 时右栏恒为 ResultsPanel（无视 selection）；`phase==='edit'` 时保持现有 inspector 逻辑。
  - 时间轴按 `phase` 挂载/隐藏。
- `src/main.js`：store 订阅按 `phase` 门控 `updateSolar`/`updateAnalysis`/ResultsPanel 重算；截图水印地点取 `label`。
- `src/scene/sunLighting.js`：`applySunLighting` 接受 `phase`，edit 态用中性固定光。
- `src/features/results/createSimulationController.js`：`calculate` 在 `phase==='edit'` 早退。
- `src/features/shell/MobileShell.js`：按 `phase` 隐藏/禁用 tab。
- 删除 `src/features/location/LocationEditor.js`、`src/features/floors/FloorSelector.js`（仍为死代码，顺手清掉）。

### 数据流

```
Header 开关 / 左树操作 / 地点选择 → store.execute(command) → view 更新
  → AppShell：按 phase 决定时间轴挂载、右栏内容（present→ResultsPanel；edit→inspector）
  → main.js：按 phase 决定是否转发 solar/analysis
  → sunLighting：按 phase 决定中性光/太阳光
  → simulationController：按 phase 决定是否 calculate
  → 左树：按 phase 决定添加按钮是否禁用
  → 移动端：按 phase 决定 tab 可用性
```

单一真相源 `view.phase`。

## 测试策略

### 单元测试（vitest）

- `setPhase` 命令：edit↔present 正确切换；present 时 `editorMode` 不影响右栏（由 AppShell 体现）。
- `simulationController`：`phase==='edit'` 时 `calculate` 早退、不通知；`phase==='present'` 时正常计算。
- `setLocation` 命令：写入 `project.location` 各字段。
- `buildingCommands`：
  - 保存观察区（create/edit）不再写 `name`。
  - `start edit` 不克隆 `name`。
  - `updateAreaEditing` 不再接受 `name`。
- 观察区标签派生：建筑内 `index+1`，删除后重排。
- 迁移：旧项目补 `phase='edit'`、丢弃 `area.name`。
- `validateProject`：观察区无 `name`、`phase` 枚举。

### 组件测试（jsdom）

- `createAreaFloorTool`：无首页、无名称输入；会话视图含楼层/工具/摘要/保存取消；由外部传入 `areaEditing` 驱动。
- `createProjectTree`：渲染 building→area 层级；每建筑有"＋ 观察区"；点建筑/观察区派发正确命令；present 态添加按钮 disabled。
- `createLocationPicker`：预设城市 + 自定义坐标；选择派发 `setLocation`。
- `AppShell`：present 态右栏为 ResultsPanel；edit 态按 selection 显示 inspector；时间轴按 phase 显隐。

### E2E（playwright）

1. edit 态：底部无时间轴；添加建筑 → 左树出现节点 + "＋ 观察区"。
2. 点"＋ 观察区" → 进入会话 → 画区 → 保存 → 左树出现观察区子节点（无名称输入）。
3. 切到展示：若无观察区被阻止；有观察区则时间轴出现、地点选择器可见、结果面板计算。
4. 展示态：添加按钮禁用；改时间轴 → 场景日照与结果更新。
5. 切回编辑：时间轴消失、模拟停。
6. 环境受限时 e2e 以 `--list` 校验解析。

### 完成前验证

```
npm test
npm run test:e2e   # 环境受限时以 --list 校验
npm run build
```

## 验收标准

- Header 有「编辑/展示」开关；edit 态无时间轴、无模拟、场景中性光；present 态有时间轴、模拟、结果面板、地点选择器。
- 左栏为 building→area 层级树，"添加建筑""添加观察区"统一在左栏，归属关系可见。
- 观察区无命名环节：无名称输入，数据模型无 `name`，标签派生。
- 右栏只做参数（edit 态）；观察区首页/列表不再出现在右栏。
- present 态几何编辑锁定；切回 edit 恢复。
- 地点可通过精简城市选择器修改；死代码 `LocationEditor` / `FloorSelector` 已删除。
- 桌面与移动行为一致，均支持鼠标、键盘、触屏。
- `npm test` 与 `npm run build` 通过；e2e 至少通过 `--list` 解析。

## 开放问题

无。方向已由用户确认：分 A→B→C 三阶段，本轮只实现 Phase A；展示态地点用精简城市选择器；观察区去 `name` 字段。
