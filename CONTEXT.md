# 领域术语表 (CONTEXT.md)

本文件为架构与领域概念命名，供人与 AI 在讨论代码时共用同一套词汇。

## 场景 (Scene)

- **室内视图 (Interior View)** — 用户进入某个房间内部、观察真实太阳光斑分布的视图模式。由 `interiorRoomId` 触发。它是一个完整的生命周期概念：进入（飞相机、掀开上方"盖子"、聚焦阴影相机）、维持（相机升高时揭盖、被挡的墙淡化）、退出（盖子归位、墙恢复、阴影复位）。归属于 `src/scene/createInteriorView.js`。

- **盖子 (Lid)** — 室内视图中，观察层顶面及以上被整块隐藏的几何：顶层房间的独立顶盖 mesh，或非顶层时上方的整段楼层。相机升到房间中段以上时隐藏，露出房间内部。

- **观察层顶面 (Band Top)** — 某楼层"到哪为止"的高度：顶层是屋顶板底（整栋高），其余层是上一层楼板底。造楼层几何、揭盖/遮挡、楼层聚焦显隐共用。归属 domain 层 `bandTopY(params)`（`src/domain/buildings/floorMath.js`），原先此式在 segmentBuilding、室内视图、控制器多处各写一遍。

- **室内取景 (Interior Frame)** — 由房间几何推导出的世界坐标包围信息 `{ center, radius }`，用于把相机飞到房间、并框定阴影相机范围。纯几何计算，归属 domain 层 `roomInteriorFrame(building, room)`。

- **指针→地面落点 (Pointer Floor)** — 把一次指针事件投射到水平面 `y=planeY` 得到世界坐标落点。`src/scene/pointerFloor.js` 的 `createFloorPicker({ canvas, camera, planeY })` 独占这段射线逻辑(原先 roomDrag、房间手势、建筑手势各写一遍)。世界→建筑本地坐标的反向旋转统一走 domain 的 `worldPointToBuildingLocal`,不再手抄。

- **mesh 标签契约 (Scene Tags)** — 场景网格用 `userData.kind` 字符串标注用途；可见性/遮挡/拾取据此过滤。`src/scene/sceneTags.js` 独占**会被读取**的标签名（`building-segment`/`building-lid`/`segment-edges`/`floor-lines`/房间几何四类）与其之上的谓词（`isSegment`、`isBuildingShell`、`isLidOrAbove`、`isFloorLines`、`isRoomGeometry`、`eachEdge`），让生产者与消费者共用同一定义。纯装饰、只写不读的标签不收录。

## 项目 / 视图 (Project / View)

- **三视图 (Three Views)** — 应用有三种互斥的工作视图,由 `view.phase` 取值决定,顶部切换栏显式呈现用户当前所在:
  - **编辑建筑 (`'building'`)** — 外景、整栋楼可见。造楼/删楼、移动/旋转/缩放建筑、选位置。不进入房间内部。
  - **编辑房间 (`'room'`)** — 进入"某栋楼 + 某一层":盖子掀开、相机斜俯,**停留**在此直到用户主动切走。在此画房间、擦除、点墙加窗加门、拖拽调整、删除。必须绑定一栋选中的楼(无选中楼则不可进入)。合盖只发生在**离开**此视图时,画完单个房间不再自动散场。入口:顶部"编辑房间"按钮(进选中楼当前层),或左侧项目树点某房间(`createEnterRoomViewCommand`,进该房间所在层并选中它)。
  - **查看采光 (`'sunlight'`)** — 只看不改。进某房间看室内采光([[室内视图]])、看全天日照曲线。
  边界原则:每个视图里"点击/拖拽的含义"固定,不跨视图猜测。取代早先的两值 `phase`(`build`/`sunlight`)。

- **室内取景态 (Room Focus)** — 编辑房间视图的**持久**状态 `view.roomFocus = { buildingId, floor } | null`,贯穿整个"编辑房间"视图。它单独驱动掀盖、楼板、已存房间叠层、相机聚焦——**与是否正在画某个房间无关**。进入编辑房间时置,离开(切到别的视图/加楼/清空)时清。这是"画完房间盖子不再合回去"的根:合盖只在 `roomFocus` 清空时发生。scene 的 `syncFloorFocus` 按它的签名 `buildingId:floor` 做增删。

- **房间草稿态 (Room Draft)** — `view.roomEditing`,降级为**临时**子状态:只在正画一个新房间(`mode:'create'`)或改一个已存房间(`mode:'edit'`)时存在,驱动绘制拖拽、缩放手势、预览、工具/模式。`createFinishRoomCommand`/`createCancelRoomCommand` 只清它、保留 [[室内取景态]],于是画完/取消后仍停在编辑房间视图。scene 里 `syncDraft` 按它的签名 `roomId:mode` 挂载/卸载草稿子件。

- **楼层选择 (Active Floor)** — 编辑房间视图内"当前操作/掀盖的是第几层"。常驻于右栏面板,画房间与掀盖都跟随它。归属 [[室内取景态]] 的 `roomFocus.floor`。

- **编辑房间工具 (Room Edit Tool)** — 编辑房间视图内决定左键在楼层平面上含义的开关 `view.roomTool`,三选一:`选择/移动 (select)`(默认,点选房间/墙、拖选中的调整)、`画房间 (draw)`(拖矩形做加法)、`擦除 (erase)`(拖矩形做减法)。加减对称,共用纯几何 `applyRectEdit`(`src/domain/rooms/rectEdit.js`,加=并集、减=差集后合并)。工具条只在有[[房间草稿态]]时出现,新建默认 draw、编辑已存房间默认 select。加窗/加门不在工具条,是"选中墙后面板出按钮"。擦除边界(`createEraseRoomRectCommand`):擦成不相连→命令返回 null、UI 提示"不能这么做";擦到不剩→删除该房间(新建草稿则丢弃,已存房间则移除)。房间 = 一块连通区域,形状任意但须连通。

- **选中归属哪栋楼 (Selected Building)** — 视图选中可能是建筑本身，也可能是它名下的房间/墙/洞口（带 buildingId）——两种都归到那栋楼。纯视图派生逻辑，归属 domain 层 `selectedBuildingId(view)`（`src/domain/project/viewSelection.js`），scene 高亮与 BuildingInspector 面板共用。注意 gizmo 的 `selectedBuildingIdForGizmo` 语义不同（额外要求 `phase==='build'`），保持独立。

## 开口 (Opening)

- **开口 (Opening)** — 门与窗统一为**同一个实体**,不再区分"门""窗"两种类型。一个开口 = 墙上的一个矩形洞,记录位置(`centerU`)、宽、底边高(窗台)、顶边高、以及所属预设。开口可架在**外墙**(连通室内与室外)或**内墙**(连通相邻两个房间,`connectedRoomIds` 承载连通关系)。

- **开口预设注册表 (Opening Preset Registry)** — 仿建筑模板的注册机制:每种开口样式(平开窗、落地窗、门洞、推拉门、平开门…)是一个注册的预设,自带**默认尺寸**、**可调属性集**、以及**对采光的影响语义**。新增样式 = 注册一个新预设,不改核心。

- **开口的采光语义(分期)** — 门窗合并**不等于**采光不区分。目标是采光模拟**读预设属性**:玻璃按透过率衰减直射光、门板按开启角度(45°/90°)充当遮挡、推拉门门框作遮挡等。**分两期**落地:
  - **一期(可用)**:把交互做顺(见[[三视图]]),开口合并为单一实体 + 预设注册表**骨架**;预设暂只带尺寸与"透光/不透光"简单属性,采光沿用现状(几何透光、`fill` 不衰减)。
  - **二期(做深)**:门板角度、推拉门、门框遮挡、玻璃透过率逐项接入采光核心(`intersectOpening`/`firstBlockingDistance` 按预设几何与透过率分支)。

## 状态 (Store)

- **试运行校验 (canExecute)** — `store.canExecute(command)` 对状态快照跑一遍命令的 `apply`，返回它是否会提交（非 null），不改状态、不进历史。拖拽 gizmo 预览有效性时用它问「这样会不会有效」，而不必伸手进命令的 `apply` 协议或状态结构。见 `src/store/createStore.js`。
