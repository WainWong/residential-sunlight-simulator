# 俯视楼层场景:观察区编辑重构设计

日期：2026-07-06
状态：已完成设计讨论，等待用户审阅

## 背景

当前"观察区与窗"编辑用的是右栏里一个抽象的 8×5 方格控件（`AreaPainter`）。用户在这个控件里按行列位置点选，存下的 `area.cells` 是 `[0..7, 0..4]` 的控件坐标——它与建筑真实 footprint（一字型是 X∈[-30,30]、Z∈[-9,9] 米）没有任何对应关系。画出来的观察区映射到 3D 场景后位置错乱，这就是"全是乱的"根因。

同时，编辑观察区这件事本质是二维的（在一层平面上圈区域），却被塞进一个和主 3D 视图割裂的侧栏小控件里，心智负担重。

## 目标

- 进入"观察区与窗"编辑后，主 3D 视图切换为俯视、只显示选中楼层，用户直接在这层平面上拖矩形圈定观察区——所见即所得，坐标天然对齐真实建筑。
- 观察区改为连续矩形（无级，不吸附网格），存真实楼层米坐标。
- 画好的观察区**碰到楼层外轮廓的地方自动成为采光口**，直接产出真实日照结果（复用现有引擎）。
- 移动端与桌面共用同一套交互，支持鼠标、键盘、触屏。

## 非目标

- 手动摆放窗、门、室内障碍物（墙/柜等）——留给未来统一的"室内障碍物"系统。
- 空腔侧壁自遮挡、开口进深逐点精细计算（"二级"保真度）——同样属于未来障碍物系统。
- 不新增第二个 Three.js 场景；不改日照引擎的核心（`evaluateDirectSun`、`buildObstacles`、`intersectOpening`）。

## 概念模型：实心楼 + 挖空腔

采用"空腔"模型作为框架与长期方向：

- 一栋楼是一个实心体（footprint 拉高）。
- 画观察区 = 在这个实心体里挖出一个空腔（矩形 × 楼层高度带）。
- 空腔**露出到建筑外表面的那些面自动成为采光口**，光从那进来；仍埋在实心里的面还是墙。不再单独"摆窗"。

这个模型只有"实心 vs 挖掉的空腔"一个概念，符合"挖到哪、亮到哪"的直觉，且与未来"室内障碍物 = 往空间加/减实心"同源，可平滑演进。

**本轮保真度：一级。** 空腔露出楼层外轮廓的面进光；采样点被照到 = 朝太阳的光线从某个露出面穿出、不被这栋楼剩余外墙及其它楼遮挡。不计空腔侧壁自遮挡与开口进深（二级，留给障碍物轮）。一级完整复用现有已测日照管线。

## 交互设计

### 进入 / 退出

- 从建筑概览点"观察区与窗"（现有 `createSetEditorModeCommand('areas')`）进入。右侧栏整体隐藏；主视口切入"楼层聚焦"呈现；画面上出现一个悬浮工具条。
- 工具条点"‹ 返回"（`createSetEditorModeCommand('none')`）退出：镜头、可见性、右栏恢复到进入前。

### 楼层聚焦呈现

- 镜头飞到正上方俯视，对准选中建筑的中心与选中楼层高度（复用现有 `cameraRig.setTopView`，透视相机）。
- 只显示选中建筑、选中楼层的一块 footprint 等大楼板；其它建筑、其它楼层全部隐藏。退出时恢复。
- 楼板上叠一层淡的 1 米参考线（仅视觉参考，不参与吸附）。
- 已画的观察区以高亮矩形盖在楼板上显示。

### 悬浮工具条

- **工具三选一**：移动视角 / 画区域 / 擦除。选"画区域""擦除"时锁死镜头控制（拖拽=画/减矩形）；选"移动视角"解锁镜头。进入时默认"画区域"。
- **楼层**：切换当前编辑楼层（楼板与已画区域随之切换到该层）。
- **观察区名字**：输入框。
- **观察区切换 + 新增**：本楼有多个观察区时显示紧凑下拉 + "＋新观察区"；仅一个时下拉可省略。
- **返回**。
- 桌面与移动端同一条。

### 画区域交互

- 按下 → 拖 → 松开，画一个矩形。拖动中显示预览框，松手定下。
- 拾取打到**楼层高度处的一个无限大水平数学平面**（非有边楼板网格），因此可从楼板外往里拖。矩形越过外墙线时，越过处按"自动开孔"规则成为采光口（见下节）；这是本轮跨墙的唯一效果。
- 一个观察区可累加多个矩形。"擦除"工具拖出的矩形从选区中减去覆盖部分。
- 不吸附整米；存浮点角坐标（楼层局部米坐标）。
- 移动端：工具为"画/擦"时单指拖=画框（镜头已锁，无手势冲突）；工具为"移动视角"时手势控制镜头。
- 键盘可达：工具条按钮均为原生 `<button>`；楼层、名称为原生输入控件。

## 自动开孔（一级）

新增纯几何函数 `deriveAperturesFromArea(building, floor, rects)`：

1. 取该层外墙轮廓（现有 `createWallSegments`）。
2. 对每个观察区矩形，判定它与哪些外墙段相交或边线重合——**严格规则：矩形跨过墙线、或矩形边与墙线完全重合，才算**（无模糊阈值）。
3. 在相交处沿该墙截出缺口区间，高度取该楼层的高度带（`floorBaseY`..`floorBaseY + floorHeight`，采样高度按现有 `sampleHeight`）。
4. 将每段缺口包装成现有 `buildOpeningPortals` 所吃的开口格式（平面 point/normal/tangent + bounds）。

`createSimulationController` 中，原"从 `area.openingIds` 找手动摆的窗"改为"调 `deriveAperturesFromArea` 自动算开口"。其后 `buildOpeningPortals`→`evaluateDirectSun`、`buildObstacles`、遮挡逻辑**全部不变**。

效果：观察区贴/越过外墙 → 该段自动开口进光；观察区缩在楼中间四面不碰墙 → 无缺口、被自身外墙围死 → 无直射（物理正确）。

## 采样：矩形 → 采样点

观察区数据从 `cells: [[x,z],…]`（整数格）改为 `rects: [{x0,z0,x1,z1},…]`（浮点米，楼层局部坐标）。

新增 `rectsToSamplePoints(rects, spacing)`：在各矩形上按固定间距（内部参数，如 1m）铺采样点，去重合并。`sampleArea` 的采样点来源改为消费它；每点仍按现有方式参与"被照亮比例 = 被照点 / 总点"。采样精度成为内部参数，不再暴露给用户（UX 无级）。

## 数据流与状态

- 不新增 store 字段；复用 `view.editorMode === 'areas'`。
- `main.js` 监听 `editorMode`：进入 areas → 命令场景控制器进入楼层聚焦（`setTopView` + 楼层隔离可见性 + 楼板/参考线 + 已画区域高亮）；退出 → 恢复。
- 观察区增改删仍走现有命令（`createUpdateObservationAreaCommand` 等），只是 payload 从 `cells` 变 `rects`。
- 计算链：`rects → rectsToSamplePoints → sampleArea`；`rects + 楼层外墙 → deriveAperturesFromArea → buildOpeningPortals`；连同 `buildObstacles(其它建筑及本楼剩余外墙)` 一起喂 `evaluateDirectSun`。

## 迁移

- `area.cells`（旧的抽象格）在项目载入迁移时**丢弃**（清空为 `rects: []`）——旧数据本就错位，无保留价值，用户重画。
- `migrateProject` 增加一步：若观察区含 `cells` 字段则删除并置 `rects: []`。
- 组件与命令统一改用 `rects`；`AreaPainter`（抽象 8×5 控件）删除。

## 组件与文件

- 删除：`src/features/areas/AreaPainter.js`、`src/features/areas/AreaInspector.js`（依附于旧控件）、`src/features/areas/ObservationAreaSection.js`（含旧网格控件与手动开窗选择器，被新工具条取代）。
- 新增：`src/features/areas/createAreaFloorTool.js`（悬浮工具条：工具三选一 / 楼层 / 名称 / 多区切换 / 返回）。`BuildingInspector` 的 areas 分支改为挂载它。
- 新增：`src/scene/floorFocus.js`（楼层聚焦：镜头俯视、可见性隔离、footprint 楼板 + 参考线）。
- 新增：`src/scene/areaDrag.js`（俯视拖拽画矩形：水平面拾取、预览框、画/擦、锁镜头）。
- 新增：`src/domain/simulation/deriveApertures.js`（`deriveAperturesFromArea`）。
- 新增：`src/domain/simulation/rectsToSamplePoints.js`。
- 改：`src/domain/simulation/sampleArea.js`（采样点来源改为 rects）。
- 改：`src/features/results/createSimulationController.js`（开口来源改为自动派生）。
- 改：`src/scene/createSceneController.js` + `src/main.js`（areas 模式接入楼层聚焦与拖拽）。
- 改：`src/domain/project/migrateProject.js`（cells→rects 迁移）。
- 改：`src/scene/observationOverlay.js`（画矩形高亮而非小方格）。

## 测试设计

### 单元测试（vitest）

- `deriveAperturesFromArea`：矩形跨南墙 → 南墙生成开口且朝向/边界正确；矩形缩在中间不碰墙 → 无开口；矩形边与墙线重合 → 开口；L 型/回字形多墙段命中正确。
- `rectsToSamplePoints`：给定矩形与间距，采样点数量/坐标正确；多矩形去重；空 rects → 空。
- `sampleArea`：消费 rects 后采样点正确（替换旧 cells 断言）。
- `createSimulationController`：贴南墙观察区正午有直射；南侧加高楼遮挡后变无直射；楼中间不碰墙观察区无直射。
- `migrateProject`：含 `cells` 的旧项目迁移后 `cells` 移除、`rects: []`。
- `observationOverlay`：给定 rects 生成矩形高亮网格。
- 纯逻辑的拖拽换算（屏幕/射线 → 楼层平面米坐标、矩形规整）抽成纯函数单测；Three.js 对象构造由 e2e 间接覆盖。

### 端到端测试（playwright）

- 进入观察区编辑 → 右栏隐藏、出现工具条、镜头俯视；拖一个矩形 → 出现高亮区域；返回 → 场景恢复。
- 运行环境限制：本环境无法下载 Playwright 浏览器，spec 以 `--list` 校验解析，运行留待有浏览器的机器。

### 完成前验证

```
npm test
npm run test:e2e   # 环境受限时以 --list 校验
npm run build
```

## 验收标准

- 进入"观察区与窗"：右栏隐藏、主视口俯视只显示选中楼层、出现悬浮工具条；返回恢复原状。
- 在楼层平面上拖矩形画观察区，可多矩形累加、可擦除，无级不吸附，可从楼板外往里拖。
- 观察区数据存楼层局部米坐标矩形；旧 `cells` 迁移时丢弃。
- 观察区碰到外墙处自动开口，日照结果真实且随场景变化（如南侧加楼由亮变暗）。
- 桌面与移动端行为一致，支持鼠标、键盘、触屏。
- `npm test`、`npm run build` 通过；e2e spec 至少通过 `--list` 解析。
