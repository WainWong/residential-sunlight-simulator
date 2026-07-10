# 立体楼层 + 室内采光视角设计（Phase B + C 合并）

日期：2026-07-10
状态：待评审

## 背景

住宅采光模拟器已完成 Phase A（编辑/展示分阶段、信息架构、观察区绘制体验、指南针）。本 spec 合并原路线图的 Phase B（立体楼层切片）与 Phase C（展示阶段室内视角 + 真实切窗洞光影），作为一个特性统一设计——因为室内光影渲染依赖立体楼层几何，两者拆开会导致返工。

现状要点：
- 观察区在数据模型中是「某栋楼、某一层、一块地板区域（axis-aligned rects）」，采样点由 `domain/simulation/sampleArea.js` 铺在**楼板平面**上。
- `domain/simulation/evaluateDirectSun.js` 已能对采样点逐个做「从点朝太阳发射线、是否穿过窗洞、是否被遮挡」的纯几何直射判定，输出量化数据（lit 掩码 / litRatio）。这套算法可跑在主线程与 Worker。
- `src/workers/dailyAnalysis.worker.js` + `createAnalysisClient.js`（`analyze(payload)` promise-per-requestId）已存在、有单测，但**尚未接入运行时**。store 的 `beginAnalysis()`/`completeAnalysis(requestId, result)` 侧通道同样为异步分析预留、至今未用。
- 编辑区聚焦楼层目前是**扁平面**（`floorFocus.js` 的 `createFloorSlab` = 一张 `ShapeGeometry` + GridHelper），墙只有 `createWallOutline` 线框。

## 目标

展示阶段，用户对某个观察区点「进入」后：
1. 楼层以**立体体块**呈现（地板 + 四周墙 + 顶盖，有真实层高）。
2. 相机**动画飞入**，fit 到观察区斜俯视角作为起点，之后完全交给编辑区那套 OrbitControls（orbit/zoom/自由朝向）。
3. 楼板**和内墙面**上实时渲染**真实光斑**——阳光透过窗洞照进室内落在表面的明亮区域，随时间/日期变化。
4. 挡在相机与观察区之间的面（外墙、顶盖等）自动淡出/剖切，避免遮挡视线。

非目标（明确留作后续）：
- 方案 4「解析窗洞投影 GPU shader」——本版不做，记为未来增强（追求矢量级锐利边缘 / 拖时间条实时全年热力图时再上）。
- 第一人称室内漫游相机。
- 天花板层高参数化（本设计不预设「常剖顶盖」，为未来层高留门，但不实现层高编辑）。
- 多次反射 / 漫射天光 / 玻璃折射——仍只做**直射**几何判定。

## 关键决策（已与用户确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| B 与 C 顺序 | **合并为一个特性** | C 依赖 B 的立体楼层几何 |
| 光影渲染方案 | **方案 3 数据纹理烘焙** | 真·单一真理源（texel 即 CPU `evaluateDirectSun` 结果），改动最小，无需第二套 GLSL + 回读校验 |
| 光斑烘焙范围 | **楼板 + 内墙面** | 只烘楼板视觉上空，墙面必须照 |
| 光斑重算时机 | **丢给 Worker 异步** | 复用 `dailyAnalysis.worker` 那套纯几何 + `beginAnalysis/completeAnalysis` requestId 时序，不阻塞主线程、拖时间条跟手 |
| 入场相机 | **fit 到斜俯视角起点，之后自由 orbit/zoom** | 呼应用户「操作体验与编辑区几乎一致」 |
| 遮挡面处理 | **全部按相机视线动态**（顶盖也参与，不常剖） | 为未来天花板/层高留门；用迟滞阈值 + 透明度渐变缓解临界闪烁 |

## 架构

### 采样模型扩展（domain 层，纯几何）

现状 `sampleArea` 只铺楼板平面网格。需扩展为「面集合采样」：给定观察区 rects + 楼层高度，生成
- 楼板面：现有平面网格（保留）。
- 四周内墙面：观察区 union 多边形（`rectUnion.js` 已能算）的每条外边界向上拉伸到层高，得到竖直墙面，各自铺网格采样点。

每个采样点带 `{ id, position(世界坐标), surfaceId, uv }`。`surfaceId` 标识属于哪个面（楼板 / 某段墙），`uv` 为该面上的归一化坐标，供主线程把 lit 掩码写进对应面的 `DataTexture`。

`evaluateDirectSun` 的判定逻辑对墙面采样点同样成立（点朝太阳发射线、穿窗洞、判遮挡），无需改判定核心，只需喂入扩展后的采样点集。

**边界**：新增 `domain/simulation/sampleSurfaces.js`（面集合采样），不改 `evaluateDirectSun` 判定核心。保持 domain 层无 DOM / 无 Three.js。

### Worker 接入（首次真正使用异步分析通道）

- Worker payload 扩展为「当前时刻 + 观察区面集合采样点 + 窗洞 + 遮挡物」，返回每个采样点的 lit 掩码（按 surfaceId 分组）。
- 主线程新建 `createInteriorLightController`（features/results 或新 features/interior）：订阅 store（时间/日期/几何变化）→ 节流后 `analyze()` → 用 requestId 时序**只认最新回包、丢弃过期**（复用 store `beginAnalysis/completeAnalysis` 语义或 client 内部保证）。
- 回包 → 写入各面 `DataTexture` → 触发 scene 更新。

### Scene 层（Three.js，imperative from main.js）

- `floorFocus.js` 的 `createFloorSlab` 升级为**立体楼层**：地板 + 拉伸墙 + 顶盖，墙/顶用可调 opacity 材质。
- 新增 `interiorLightMaps.js`：管理各面 `DataTexture` + ShaderMaterial（或带 map 的 MeshBasicMaterial，texel 亮=暖色/暗=冷色，双线性插值 + smoothstep 柔化边缘）。
- 新增遮挡处理 `occlusionFade.js`：每帧从相机向观察区中心+采样点 raycast，命中的面按迟滞阈值渐变 opacity；顶盖同样参与。可选叠加 clipping plane 剖屋顶。
- 入场相机动画：`createCameraRig` 增加 `flyToArea(bounds, floorHeight)`，tween 到 fit 斜俯机位，结束后交还 OrbitControls。

### 数据流

```
store(time/geometry) → interiorLightController(节流)
   → analysisClient.analyze(surfaces payload) [Worker]
   → lit 掩码(按 surfaceId) → interiorLightMaps 写 DataTexture
   → scene 重绘；occlusionFade 每帧独立按相机更新
```

## 错误处理与边界

- Worker 不可用 / WebGL 不支持：降级为无光斑的纯立体楼层展示（或退回主线程同步烘焙），不崩。
- requestId 时序：过期回包直接丢弃，避免拖动时旧结果覆盖新结果。
- 相机临界闪烁：迟滞阈值（淡出/恢复触发距离不同）+ opacity 插值过渡。
- 太阳在地平线下（`sunDirection.y <= 0`）：全暗，`evaluateDirectSun` 已处理。

## 测试

- 单元（vitest）：`sampleSurfaces` 面集合采样正确性（楼板 + 墙面点数/位置/uv）；worker payload/回包对新采样点的 lit 掩码；requestId 丢弃过期回包。
- e2e（playwright）：展示阶段点观察区「进入」→ 相机进入、立体楼层出现、光斑随时间条变化、遮挡面淡出。
- 复用现有 `evaluateDirectSun` 单测保证判定核心不回归。

## 未来增强（不在本版）

- 方案 4：抽 `isLit(point, sunDir)` 为 CPU/GLSL 共享函数，GPU fragment shader 解析窗洞投影出矢量级锐利光斑 + float RT `readRenderTargetPixelsAsync` 回读校验（一致率 >99.5%）。用于拖时间条实时全年热力图。
- 天花板层高参数化。
- 第一人称室内漫游。
