# 显式编辑模式：选中与编辑解耦设计

日期：2026-07-06
状态：已完成设计讨论，等待用户审阅

## 背景

当前检查器把"选中建筑"和"编辑建筑"绑成了一件事：在左侧对象树或 3D 场景里点一栋楼，都会派发 `createSelectBuildingCommand(id, { editing: true })`，右栏立刻显示建筑参数表单、场景里那栋楼变成半透明蓝图。用户没有"只想看看、不想编辑"的状态。

这个耦合还导致一个实际 bug（经真实组件验证）：`BuildingInspector` 的 `render()` 有一句 `if (renderedId === building.id) return;` 作为避免重建输入框、防止输入焦点丢失的缓存守卫。但这个缓存的 key 只用了 `building.id`，没有反映"这栋楼是否还在 adding 状态"。于是"添加建筑 → 完成建筑"这条路径里 `selectedBuildingId` 始终不变、key 不变，`render()` 直接跳过，负责观察区/窗户的区块（只在非 adding 时追加）永远补不上。结果：**单栋建筑场景下，用户根本点不出"添加观察区"**——只有添加第二栋、再切回第一栋（让 key 变化触发重绘）才能出现。整个观察区/窗户功能对单栋建筑被挡死。

`store` 的 `view` 里已经有 `selectedBuildingId` 和 `editingBuildingId` 两个分开的字段，但 UI 从未利用这个区分，一直绑在一起用。

## 目标

- 点选一栋建筑（树或场景）只表示"选中"：右栏显示只读概览、场景高亮，**不自动进入编辑**。
- 选中后，用户显式选择走"编辑建筑参数"还是"观察区与窗"两条互斥路径之一；任意时刻只出现其中一个编辑界面。
- 从一个编辑界面切到另一个，必须先返回概览再进——两个编辑器永不同屏。
- 结构性消除单栋建筑点不出"添加观察区"的 bug。
- 桌面与移动端共用同一套状态与路由，不建两套逻辑。

## 非目标

- 场景内跟随建筑的浮动操作图标（编辑/移动），本轮不做——留待下一轮与拖拽一起做。
- 拖拽放置建筑（鼠标指哪楼放哪）替代坐标输入，是独立且更重的场景交互子系统，单开一份 spec。
- 不改动日照计算、时间轴、导入导出、草稿持久化等既有功能。

## 采用方案

用一个**显式的编辑模式枚举**替换 `editingBuildingId`。右栏对一栋选中建筑只有三种互斥状态（概览 / 参数编辑 / 观察区编辑），这正好是一个三值枚举，而一个可空 id 字段只能表达单个编辑器的"开/关"布尔、无法表达三选一。

理由：这是把"右栏显示什么"的真相源从"选中的楼变没变"（一个不完整的隐式信号）改成"当前处于哪个显式模式"。渲染 key 从 `selectedBuildingId` 变为 `(selectedBuildingId, editorMode)`，add→finish 时 `editorMode` 由 `'building'` 变 `'none'`、key 变化、面板必然重绘——bug 因此结构性消失，而不是靠监听某个具体状态转移打补丁。这也与代码库已有的 `syncScene.js` "用 `${revision}:${isPreview}` 组合签名决定重建"模式一致。

代价：`editingBuildingId` 字段被 `editorMode` 替换，会动到 `buildingCommands.js` 的命令工厂、它们的单测、以及场景的 `previewBuildingId` 取值。这是重设计应付的成本，不是绕路。

## 状态模型

```
view.selectedBuildingId : string | null   当前选中的楼（高亮 + 概览依据）
view.editorMode         : 'none' | 'building' | 'areas'   替换原 editingBuildingId
view.addingBuildingId   : string | null   不变，区分"刚新建、可取消本次添加"
```

`editorMode` 对应右栏三个互斥界面：

| editorMode | 右栏界面 |
|---|---|
| `'none'` | A 只读概览（分岔口，含两个入口按钮 + 删除） |
| `'building'` | B 建筑参数编辑器 |
| `'areas'` | C 观察区与窗编辑器 |

各操作对字段的影响：

| 操作 | selectedBuildingId | editorMode | addingBuildingId |
|---|---|---|---|
| 树/场景点选建筑 | = 该楼 | `'none'` | 不变 |
| 添加建筑 | = 新楼 | `'building'` | = 新楼 |
| 概览点"编辑建筑" | 不变 | `'building'` | 不变 |
| 概览点"观察区与窗" | 不变 | `'areas'` | 不变 |
| 编辑器点"‹ 返回" | 不变 | `'none'` | 不变 |
| 完成建筑 | 不变 | `'none'` | 置空 |
| 取消本次添加 / 删除 / 清空 | 置空 | `'none'` | 置空 |

派生值（不单独存储）：
- `previewBuildingId`（蓝图材质）= `editorMode === 'building' ? selectedBuildingId : null`
- `highlightBuildingId`（选中高亮）= `selectedBuildingId && editorMode !== 'building' ? selectedBuildingId : null`

## 右栏界面与流转

右栏是个小路由，任意时刻只挂载一个界面：

```
无选中             → 结果面板（不变）

[A 概览 / 分岔口] editorMode='none'
   只读：名称、模板、长×深、楼层×层高、旋转、观察区数、窗数
   入口按钮：「编辑建筑」「观察区与窗」
   次要：「删除建筑」

[B 建筑参数] editorMode='building'
   顶部「‹ 返回」；参数表单（名称/模板/X/Y/长/深/层数/层高/旋转）
   底部「完成」（新建时为「取消本次添加」）
   不含观察区区块（解耦关键）

[C 观察区与窗] editorMode='areas'
   顶部「‹ 返回」；现有 ObservationAreaSection（涂格子/楼层/加窗）
```

流转：

```
无选中 ──点选建筑──▶ [A 概览]
                        ├─「编辑建筑」──▶ [B 参数] ──返回──▶ [A]
                        ├─「观察区与窗」▶ [C 观察区]─返回──▶ [A]
                        └─「删除」/清空 ─▶ 无选中
添加建筑 ───────────────────────────▶ [B 参数（底部为"取消本次添加"）] ─完成─▶ [A]
```

- B 与 C 永不同屏；从 B 换到 C 必须经 A。
- "添加建筑"直接落到 B；完成后回到 A。
- A 是唯一分岔口，也是删除入口。

## 场景选中高亮

`buildingMesh` 增加第三态材质，与实体/蓝图区分：

```
未选中                     → 实体材质
选中 + editorMode≠'building' → 实体 + 高亮（描边或微发光）
editorMode='building'       → 蓝图材质（盖过高亮）
```

`syncScene` 的重建签名从 `${revision}:${isPreview}` 扩展为 `${revision}:${preview}:${highlight}`，沿用现有 diff 机制。`main.js` 传给场景的不再是 `editingBuildingId`，而是从 `(selectedBuildingId, editorMode)` 派生的 `previewBuildingId` 与 `highlightBuildingId`。

## 移动端映射

底部四 tab（场景/建筑/模拟/结果）结构不变；"建筑" tab 的内容变成上面的右栏小路由（A/B/C 三选一）：

- 场景 tab：对象树 + 添加建筑（不变）
- 建筑 tab：按 `(selectedBuildingId, editorMode)` 显示 A / B / C
- 模拟 / 结果：不变

自动切 tab（现 AppShell 中"开始编辑就跳 editor tab"逻辑）改用新模型：
- 树里点选建筑 → 自动切"建筑" tab，显示 A 概览
- 点添加建筑 → 切"建筑" tab，显示 B 参数
- B/C 点返回 → 停在"建筑" tab，回到 A

桌面与移动共用同一 `(selectedBuildingId, editorMode)` 状态和同一右栏路由组件。

## 组件与文件

- `domain/project/defaultProject.js`：`view` 去掉 `editingBuildingId`，加 `editorMode: 'none'`。
- `store/buildingCommands.js`：
  - `createSelectBuildingCommand(id)` → 设 `selectedBuildingId=id, editorMode='none'`（去掉 `{ editing }` 入参）。
  - `createAddBuildingCommand` → `editorMode='building'`。
  - 新增 `createSetEditorModeCommand(mode)`（概览入口/返回用）。
  - `createFinishBuildingCommand` → `editorMode='none'`、清 `addingBuildingId`。
  - `createCancelAddedBuildingCommand` / `createRemoveBuildingCommand` / `createClearBuildingsCommand` → `editorMode='none'`。
- `features/buildings/BuildingInspector.js`：改为按 `(selectedBuildingId, editorMode)` 挂载 A/B/C 之一的小路由；消除 memo-key bug。
- 新增 `features/buildings/BuildingOverview.js`（A 概览卡片，只读摘要 + 入口按钮 + 删除）。
- `features/areas/ObservationAreaSection.js`：基本不动，改由 editorMode='areas' 显式挂载。
- `features/shell/AppShell.js`：`updateInspector` 按 editorMode 判定右栏（无选中→结果面板；有选中→inspector）；移动端自动切 tab 逻辑改用新模型。
- `scene/buildingMesh.js` + `scene/syncScene.js`：加高亮材质；签名扩为 `${revision}:${preview}:${highlight}`。
- `scene/createSceneController.js` + `main.js`：`updateProject` 接收/派生 `previewBuildingId` 与 `highlightBuildingId`。

## 数据流

```
点选/添加/编辑/返回/删除 → store.execute(command) → view 更新
  → BuildingInspector 订阅：按 (selectedBuildingId, editorMode) 挂 A/B/C
  → AppShell：无选中→结果面板；有选中→inspector；移动端切 tab
  → main.js：派生 previewBuildingId + highlightBuildingId → scene.updateProject
```

单一真相源是 `view.(selectedBuildingId, editorMode)`，所有消费者从它派生，不各存副本。

## 测试设计

### 单元测试（vitest）

- `buildingCommands`：
  - 点选建筑 → `selectedBuildingId` 设置、`editorMode==='none'`（不再自动编辑）。
  - 添加建筑 → `editorMode==='building'`、`addingBuildingId` 设置。
  - `createSetEditorModeCommand('areas'|'building'|'none')` → 只改 editorMode，不动 selectedBuildingId。
  - 完成 / 取消 / 删除 / 清空 → `editorMode` 回 `'none'`（相应清空 id）。
  - 现有引用 `editingBuildingId` 的断言改为新模型。
- `BuildingInspector`（jsdom）：
  - 添加建筑 → 显示 B 参数、无观察区区块。
  - **add→finish（单栋）→ 显示 A 概览，且"观察区与窗"入口可见**（旧代码卡死的场景，必须通过）。
  - A 点"观察区与窗" → 显示 C、隐藏 B；C 返回 → 回 A。
  - 断言 B 与 C 不同时出现。
- `syncScene`：选中态 → 重建为高亮材质；`editorMode='building'` → 蓝图；签名相同不重建。

### 端到端测试（playwright）

- 单栋建筑：添加 → 完成 → 概览可见"观察区与窗" → 进入涂格子加窗 → 返回 → "编辑建筑"改参数。验证"选中不自动编辑""两编辑器不同屏"。
- 运行环境限制：本环境无法下载 Playwright 浏览器，spec 照写并以 `--list` 校验解析，实际运行在具备浏览器的机器上补跑。

### 完成前验证

```
npm test
npm run test:e2e   # 环境受限时以 --list 校验
npm run build
```

## 验收标准

- 点选建筑（树或场景）只选中、显示只读概览与场景高亮，不自动进入编辑。
- 概览提供"编辑建筑""观察区与窗"两个互斥入口；任意时刻右栏只出现其中一个编辑界面。
- 从一个编辑器切换到另一个需经概览返回，两者不同屏。
- 单栋建筑可直接进入"观察区与窗"添加观察区（原 bug 消除）。
- 场景中选中建筑有区别于蓝图的高亮；仅在编辑参数时显示蓝图。
- 桌面与移动端行为一致，均支持鼠标、键盘、触屏。
- `npm test` 与 `npm run build` 通过；e2e spec 至少通过 `--list` 解析。
