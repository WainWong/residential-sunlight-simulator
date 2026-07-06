# 结果面板接入真实计算：质量修复设计

日期：2026-07-06
状态：已完成设计讨论，等待用户审阅

## 背景

一轮系统性代码质量审查发现，结果面板（`ResultsPanel`）和场景叠加层展示的"当前直射""照亮比例""全天直射时段"等核心数据，全部来自硬编码常量，与用户在沙盘中实际摆放的建筑、观察区、开口完全无关：

- `src/features/results/createSimulationController.js:3` 定义了固定的 `DIRECT_INTERVAL = { startMinute: 552, endMinute: 878 }`，`litRatio` 固定为 `0.58`，从未调用 `src/domain/simulation/` 下已经实现并通过单元测试的真实几何引擎（`evaluateDirectSun`、`sampleArea`、`intersectOpening`、`intersectObstacles`）。
- `src/workers/dailyAnalysis.worker.js` 与 `src/workers/createAnalysisClient.js` 实现了全天扫描，但没有被 `main.js` 或任何 feature 引用。
- `src/scene/observationOverlay.js`、`src/scene/openingOverlay.js` 能把观察区网格和开口画进 3D 场景，但没有被 `syncScene.js` 或 `createSceneController.js` 调用，用户画的观察区和加的窗户在场景里不可见。
- `project.simulation.activeAreaId` 在默认项目中定义，但代码库中没有任何地方读取或写入它——多建筑多观察区场景下，没有"当前查看哪个区域结果"的选择机制。
- `src/features/wizard/Wizard.js`、`src/features/areas/ObservationAreaEditor.js`、`src/features/openings/OpeningEditor.js` 三个文件在 2026-07-04 沙盘重构后已零引用，但仍留在代码库中，与真正生效的 `ObservationAreaSection.js` 存在整套重复逻辑。

这些问题共享同一个根因：几何计算引擎写完测完了，但从场景状态到计算输入的"适配层"从未实现，导致产品核心承诺——"当前直射与全天时段来自几何计算"（见 `docs/superpowers/specs/2026-07-02-residential-sunlight-simulator-design.md` 验收标准）——目前不成立。

## 目标

- 结果面板显示的"当前是否直射""照亮比例"随场景中建筑位置、旋转、观察区、开口的变化而正确变化。
- 观察区和开口在 3D 场景中可见，且能直观展示"哪些采样点被照亮"。
- 多观察区场景下用户可以选择查看哪个区域的结果。
- 清理已确认的死代码，避免维护两套并行的观察区/开口编辑逻辑。

## 非目标

- 全天直射时段与总时长的真实计算（依赖 Worker 接入）不在本轮范围内，面板对应字段显示"尚未计算"占位，留给下一轮。
- 不新增建筑模板、开口类型或几何精度以外的产品功能。
- 不重做已经工作正常的建筑编辑器、时间轴、草稿持久化等模块。

## 采用方案

采用"完整精确几何"路线：遮挡计算支持建筑旋转和 L 型/回字形轮廓，而非退化为轴对齐近似盒子；开口朝向按当前建筑旋转角度实时解析真实墙段几何，而非依赖固定的方向标签。

理由：项目的建筑模型天然支持旋转和非矩形轮廓（`domain/buildings/createFootprint.js`、`rotation` 字段），如果遮挡计算只用近似盒子，会在这两种最常见的场景下给出错误结果，违背产品"购房参考级"的可靠性要求。开口方向如果不实时解析，建筑旋转后开口检测会悄悄跟着错误的方向计算，且没有任何报错提示用户——这是比"完全不算"更危险的错误。

## 组件改动

### 1. `src/domain/simulation/intersectObstacles.js`（改造）

新增 `buildObstacles(buildings)`：对每栋建筑取 `createFootprint` 的轮廓（含 `courtyard` 的 `outer`/`holes`），按 `building.rotation` 旋转到世界坐标，按 `floorMath.totalBuildingHeight` 拉伸成 3D 遮挡体。新增射线与旋转多边形棱柱的相交测试（复用 `intersectOpening.js` 中已有的平面-射线数学，将棱柱拆成侧面逐面测试）。保留现有 `intersectRayAabb`/`firstObstacleDistance` 供现有单测和简单场景复用，遮挡体检测在其基础上扩展，不破坏现有接口。回字形建筑的内轮廓（`holes`）同样生成遮挡几何，用于覆盖"回字形中庭内侧遮挡"场景。

### 2. `src/domain/buildings/wallGeometry.js`（新建）

新增 `resolveWallPlane(building, wallId)`：输入建筑当前状态（含 `rotation`）和真实墙段 ID（来自 `createWallSegments` 生成的 `wall-outer-0` 等编号），输出世界坐标下的开口所需平面数据（`point`/`normal`/`tangent`）。

开口的方向解析改为**实时计算**而非添加时快照：`buildOpeningPortals(building, openings)` 在每次计算时，根据开口记录的 `wallId` 和建筑**当前**的 `rotation`/`position`，重新调用 `resolveWallPlane` 得到平面。这样建筑旋转后开口检测自动跟随墙体转动，不会出现几何过时的情况。

`wallId` 与用户点选的"南/东/北/西侧外墙"之间的映射：添加开口时，根据建筑当前旋转角度，找到最接近用户所选方向的真实墙段编号并存为 `wallId`（一次性映射，之后不再依赖方向标签，只依赖 `wallId` 对应的真实几何）。

### 3. `src/domain/simulation/evaluateDirectSun.js`

接口不变。调用方改为传入 `buildObstacles`/`buildOpeningPortals` 计算出的真实几何，而非空数组。

### 4. `src/features/results/createSimulationController.js`（重写核心）

- 解析当前激活观察区：从 `project.simulation.activeAreaId` 查找；查不到（未设置或指向已删除区域）时回退到场景内第一栋建筑的第一个观察区；完全没有观察区时标记 `noArea: true`。
- 计算链：`activeArea → buildObstacles(project.buildings) → buildOpeningPortals(activeArea 所属建筑, activeArea.openingIds 对应的 openings) → evaluateDirectSun`。
- 发布状态新增 `noArea` 字段，用于区分"没有可分析区域"和"有区域但确实无直射"两种语义。
- `intervals`/`totalMinutes` 固定返回 `null`（全天分析不在本轮范围内）。

### 5. `src/features/results/ResultsPanel.js`

- `state.noArea` 为真时，直射状态展示"暂无观察区"，不展示误导性的"无直射"。
- `state.totalMinutes == null` 时，"直射时段"和"总时长"两行显示"尚未计算"，不再使用硬编码的 `09:12–14:38`。
- 项目中观察区总数 > 1 时，新增下拉选择器，选择后通过 `store.execute` 写入 `project.simulation.activeAreaId`。

### 6. 场景叠加层接入（`src/scene/createSceneController.js` + `syncScene.js`）

新增 `updateAnalysis(simulationState)` 方法：根据当前激活观察区的 `cells` 和计算结果中的 `litSampleIds`，调用 `createObservationOverlay` 生成/更新网格叠加层；根据关联开口调用 `createOpeningOverlay`。叠加层随建筑 `revision` 变化或激活区域切换时重建，并在 `dispose()` 中清理。

### 7. 死代码清理

删除 `src/features/wizard/Wizard.js`、`src/features/areas/ObservationAreaEditor.js`、`src/features/openings/OpeningEditor.js`（均为零引用，功能已被 `ObservationAreaSection.js` 完整替代）。`tests/e2e/wizard-building.spec.js` 重命名为 `tests/e2e/add-building.spec.js`（测试内容本身已经是"添加建筑"流程，无需改动断言）。

## 数据流

```
用户操作（拖动时间/日期、选建筑、画观察区、加开口、选激活区域）
  → store.execute(command) → project 状态更新
  → store.subscribe 触发 createSimulationController 重新计算
    → 解析 activeArea（找不到则标记 noArea）
    → buildObstacles(project.buildings)          // 每次重算，不缓存
    → buildOpeningPortals(所属建筑, 关联开口)      // 按建筑当前状态实时解析
    → evaluateDirectSun({ area, openings, obstacles, sunDirection })
    → 发布 { hasDirectSun, litRatio, litSampleIds, openingHits, noArea, intervals: null, totalMinutes: null }
  → ResultsPanel 渲染真实数字或占位文案
  → sceneController.updateAnalysis() 用 litSampleIds 绘制场景叠加层
```

## 边界情况

- **没有任何建筑或观察区**：`noArea: true`，面板显示"暂无观察区"。
- **观察区存在但未关联任何开口**：`openings` 为空数组，`evaluateDirectSun` 现有逻辑返回 `hasDirectSun: false`（循环体不会命中任何开口）。这属于"有区域但无光源"，与 `noArea` 语义不同，面板正常显示"无直射"。
- **建筑旋转后开口方向**：通过实时解析（而非快照）保证不出现过时几何。
- **回字形内侧遮挡**：`buildObstacles` 为内轮廓（`holes`）同样生成遮挡几何。
- **性能**：`buildObstacles` 每次状态变化都会重新计算所有建筑几何，不做缓存。当前场景规模（十栋量级）下开销可控；场景规模显著增长后的性能优化不在本轮范围内。

## 测试设计

### 单元测试

- `buildObstacles`：直建筑、旋转 45° 建筑、L 型、回字形（含内轮廓遮挡）四个基准案例。
- `resolveWallPlane`：同一 `wallId` 在建筑旋转前后解析出不同的世界坐标朝向。
- `createSimulationController`：替换原有对硬编码值的断言，改为验证不同建筑摆位/遮挡下 `hasDirectSun`、`litRatio` 随场景变化；新增 `noArea` 场景断言。
- `evaluateDirectSun` 现有单测保持不变（接口未变）。

### 端到端测试

- 新增场景：放置一栋建筑遮挡另一栋建筑的窗户，断言结果面板从"有直射"变为"无直射"——当前完全没有覆盖、也是本轮修复最需要验证的场景。
- `wizard-building.spec.js` 重命名为 `add-building.spec.js`，断言内容不变。

### 完成前验证

依次运行：

```bash
npm test
npm run test:e2e
npm run build
```

任何测试失败或构建警告都必须在交付前解释或修复。

## 验收标准

- 结果面板的"当前直射""照亮比例"随场景中建筑位置、旋转、遮挡关系变化，不再是固定值。
- 旋转建筑和 L 型/回字形建筑的遮挡判定几何正确（有对应单测覆盖）。
- 开口朝向随建筑旋转实时更新，不依赖过时的方向标签。
- 场景中可见用户绘制的观察区网格和添加的开口，且被照亮的采样点有明确视觉区分。
- 多观察区项目可以切换查看不同区域的结果。
- 全天直射时段/总时长明确显示"尚未计算"，不再展示虚假数据。
- `Wizard.js` 等三个死代码文件被移除，无遗留引用。
- `npm test`、`npm run test:e2e`、`npm run build` 全部通过。
