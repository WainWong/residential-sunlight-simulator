# 领域术语表 (CONTEXT.md)

本文件为架构与领域概念命名，供人与 AI 在讨论代码时共用同一套词汇。

## 场景 (Scene)

- **室内视图 (Interior View)** — 用户进入某个房间内部、观察真实太阳光斑分布的视图模式。由 `interiorRoomId` 触发。它是一个完整的生命周期概念：进入（飞相机、掀开上方"盖子"、聚焦阴影相机）、维持（相机升高时揭盖、被挡的墙淡化）、退出（盖子归位、墙恢复、阴影复位）。归属于 `src/scene/createInteriorView.js`。

- **盖子 (Lid)** — 室内视图中，观察层顶面及以上被整块隐藏的几何：顶层房间的独立顶盖 mesh，或非顶层时上方的整段楼层。相机升到房间中段以上时隐藏，露出房间内部。

- **观察层顶面 (Band Top)** — 某楼层"到哪为止"的高度：顶层是屋顶板底（整栋高），其余层是上一层楼板底。造楼层几何、揭盖/遮挡、楼层聚焦显隐共用。归属 domain 层 `bandTopY(params)`（`src/domain/buildings/floorMath.js`），原先此式在 segmentBuilding、室内视图、控制器多处各写一遍。

- **室内取景 (Interior Frame)** — 由房间几何推导出的世界坐标包围信息 `{ center, radius }`，用于把相机飞到房间、并框定阴影相机范围。纯几何计算，归属 domain 层 `roomInteriorFrame(building, room)`。

- **指针→地面落点 (Pointer Floor)** — 把一次指针事件投射到水平面 `y=planeY` 得到世界坐标落点。`src/scene/pointerFloor.js` 的 `createFloorPicker({ canvas, camera, planeY })` 独占这段射线逻辑(原先 roomDrag、房间手势、建筑手势各写一遍)。世界→建筑本地坐标的反向旋转统一走 domain 的 `worldPointToBuildingLocal`,不再手抄。

- **mesh 标签契约 (Scene Tags)** — 场景网格用 `userData.kind` 字符串标注用途；可见性/遮挡/拾取据此过滤。`src/scene/sceneTags.js` 独占**会被读取**的标签名（`building-segment`/`building-lid`/`segment-edges`/`floor-lines`/房间几何四类）与其之上的谓词（`isSegment`、`isBuildingShell`、`isLidOrAbove`、`isFloorLines`、`isRoomGeometry`、`eachEdge`），让生产者与消费者共用同一定义。纯装饰、只写不读的标签不收录。

## 状态 (Store)

- **试运行校验 (canExecute)** — `store.canExecute(command)` 对状态快照跑一遍命令的 `apply`，返回它是否会提交（非 null），不改状态、不进历史。拖拽 gizmo 预览有效性时用它问「这样会不会有效」，而不必伸手进命令的 `apply` 协议或状态结构。见 `src/store/createStore.js`。
