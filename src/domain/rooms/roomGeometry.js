import { clipRectToFootprint } from '../buildings/footprintClip.js';
import { floorBaseY } from '../buildings/floorMath.js';
import { rotateLocalToWorld } from '../buildings/wallGeometry.js';
import { rectUnionToPolygons } from '../buildings/rectUnion.js';

const EPS = 1e-6;

// 室内取景 (Interior Frame)：由房间几何推导相机要飞去的世界坐标包围信息。
// center 是房间在世界地图上的几何中心（y 取观察层楼板 + 半层高，约在人眼高度），
// radius 是房间世界足迹对角线的一半（下限 6m，避免小房间相机贴脸）。
// 纯几何，无 Three.js / DOM 依赖 —— 主线程与新场景模块共用。
export function roomInteriorFrame(building, room) {
  if (!building || !room) return null;
  const baseY = floorBaseY({ floor: room.floor, ...building.params });
  const corners = (room.rects ?? []).flatMap(rect =>
    [[rect.x0, rect.z0], [rect.x0, rect.z1], [rect.x1, rect.z0], [rect.x1, rect.z1]]
      .map(([x, z]) => {
        const [wx, wz] = rotateLocalToWorld([x, z], building.rotation);
        return [wx + building.position.x, wz + building.position.z];
      }));
  if (corners.length === 0) return null;
  const xs = corners.map(point => point[0]);
  const zs = corners.map(point => point[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  return {
    center: {
      x: (minX + maxX) / 2,
      y: baseY + building.params.floorHeight / 2,
      z: (minZ + maxZ) / 2
    },
    radius: Math.max(6, Math.hypot(maxX - minX, maxZ - minZ) / 2)
  };
}

export function rectArea(rects = []) {
  return rects.reduce((sum, rect) => sum + Math.abs((rect.x1 - rect.x0) * (rect.z1 - rect.z0)), 0);
}

export function normalizeRects(rects = []) {
  return rects
    .map(rect => ({
      x0: Math.min(rect.x0, rect.x1),
      z0: Math.min(rect.z0, rect.z1),
      x1: Math.max(rect.x0, rect.x1),
      z1: Math.max(rect.z0, rect.z1)
    }))
    .filter(rect => rect.x1 - rect.x0 > EPS && rect.z1 - rect.z0 > EPS);
}

export function rectsOverlap(a, b) {
  return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS
    && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > EPS;
}

// 连通性判定用真并集:把 rects 并成直角多边形,恰好一个外轮廓 = 连通。
// 这样重叠、部分共边、L/T 形都能正确判为一块,断开或只靠一个角点相触则为多块。
function connected(rects) {
  if (rects.length < 2) return true;
  return rectUnionToPolygons(rects).length === 1;
}

export function validateRoomRects(rects, occupiedRects = [], { allowDisconnected = false } = {}) {
  const normalized = normalizeRects(rects);
  if (normalized.length === 0) return { ok: false, reason: 'empty' };
  // 同一房间内部 rects 互相重叠是合法的(并集=同一片区域),不再拒绝自重叠;
  // 只判连通(并集恰好一块)。与别的房间的重叠在下方 occupied 检查里照拒。
  if (!allowDisconnected && !connected(normalized)) return { ok: false, reason: 'disconnected' };
  if (normalized.some(rect => normalizeRects(occupiedRects).some(other => rectsOverlap(rect, other)))) {
    return { ok: false, reason: 'occupied' };
  }
  return { ok: true, reason: null };
}

export function validateBuildingRooms(building) {
  if (!Array.isArray(building?.rooms)) return { ok: false, reason: 'rooms' };
  const occupiedByFloor = new Map();
  for (const room of building.rooms) {
    if (!Number.isInteger(room?.floor)
      || room.floor < 1
      || room.floor > building.params.floors) {
      return { ok: false, reason: 'floor', roomId: room?.id ?? null };
    }
    if (!Array.isArray(room.rects) || room.rects.length === 0
      || room.rects.some(rect => !Number.isFinite(rect?.x0)
        || !Number.isFinite(rect?.z0) || !Number.isFinite(rect?.x1)
        || !Number.isFinite(rect?.z1) || rect.x1 - rect.x0 <= EPS
        || rect.z1 - rect.z0 <= EPS)) {
      return { ok: false, reason: 'rects', roomId: room?.id ?? null };
    }
    const occupied = occupiedByFloor.get(room.floor) ?? [];
    const roomValidation = validateRoomRects(room.rects, occupied);
    if (!roomValidation.ok) {
      return { ...roomValidation, roomId: room?.id ?? null };
    }
    const outside = room.rects.some(rect => {
      const clipped = clipRectToFootprint(rect, building.template, building.params);
      return Math.abs(rectArea(clipped) - rectArea([rect])) > EPS;
    });
    if (outside) return { ok: false, reason: 'footprint', roomId: room?.id ?? null };
    occupiedByFloor.set(room.floor, [...occupied, ...normalizeRects(room.rects)]);
  }
  return { ok: true, reason: null };
}

export function nextRoomName(rooms = []) {
  return `房间 ${rooms.length + 1}`;
}
