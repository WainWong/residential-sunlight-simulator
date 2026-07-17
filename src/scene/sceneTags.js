import { SLAB_THICKNESS } from '../domain/buildings/segmentBuilding.js';

// mesh 标签契约 (Scene Tags)。场景里每块网格用 `userData.kind` 字符串标注用途;
// 可见性、遮挡、拾取都据此过滤。此模块独占那些**会被读取**的标签名与其之上的
// 谓词,让生产者(建网格的地方)与消费者(判可见性/遮挡的地方)引用同一定义
// —— 改一个标签名只需改这里一处,不再散落硬编码、漏改也不报错。
//
// 纯装饰性、只写不读的标签(overlay/gizmo/aids 等)不在此列:把它们收进来只是
// 徒增一道没人查的常量,反而是噪声。

// —— 被读取的 kind 常量 ——
export const BUILDING_SEGMENT = 'building-segment'; // 挖好洞的墙身分段
export const BUILDING_LID = 'building-lid';         // 房间顶盖 / 楼板盖
export const SEGMENT_EDGES = 'segment-edges';       // 段的描边线(段/盖的子对象)
export const FLOOR_LINES = 'floor-lines';           // 楼层分隔描边线
export const ROOM_FLOOR = 'room-floor';
export const ROOM_WALL = 'room-wall';
export const OPENING_GLASS = 'opening-glass';
export const OPENING_OPEN = 'opening-open';

// 房间几何(楼板/墙/洞口):楼层聚焦时按 floor 逐层显隐。
export const ROOM_GEOMETRY_KINDS = new Set([ROOM_FLOOR, ROOM_WALL, OPENING_GLASS, OPENING_OPEN]);

const kindOf = mesh => mesh?.userData?.kind;

// 墙身分段(不含顶盖)。遮挡射线只测这些。
export const isSegment = mesh => kindOf(mesh) === BUILDING_SEGMENT;

// 建筑实体外壳 = 墙身分段或顶盖。可见性/揭盖逻辑作用于这一组。
export const isBuildingShell = mesh =>
  kindOf(mesh) === BUILDING_SEGMENT || kindOf(mesh) === BUILDING_LID;

export const isFloorLines = mesh => kindOf(mesh) === FLOOR_LINES;

export const isRoomGeometry = mesh => ROOM_GEOMETRY_KINDS.has(kindOf(mesh));

// "盖子"判定:观察层顶面(bandToY)及以上的外壳网格。顶盖的 fromY≈bandToY-SLAB,
// 上方段 fromY≈bandToY,都归"盖子";观察层墙身 fromY<bandToY,楼下段更低,留下。
// 减去 SLAB 与一个 1cm 容差,吸收浮点与板厚。原先此式在室内视图与楼层聚焦各写
// 一遍 —— 现在只此一处。
const EPS = 0.01;
export const bandThreshold = bandToY => bandToY - SLAB_THICKNESS - EPS;

export const isLidOrAbove = (mesh, bandToY) =>
  mesh?.userData?.fromY > bandThreshold(bandToY);

// 遍历一块外壳网格的描边线子对象('segment-edges'),对每个调用 fn。
export function eachEdge(mesh, fn) {
  for (const child of mesh.children) {
    if (kindOf(child) === SEGMENT_EDGES) fn(child);
  }
}
