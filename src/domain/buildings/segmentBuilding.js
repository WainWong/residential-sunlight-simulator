// 把一栋楼切成若干上下叠放的实体段,并为含观察区的段生成"刀"
// (挖房间空腔的棱柱多边形)。纯数学,无 three.js,供 scene 层执行 CSG。
//
// 共面消除:三维布尔在两面精确共面处的里/外分类是浮点 0/0,会产生闪烁膜
// 或裂缝。刀在与 footprint 墙重合的边上向外凸出 OPENING_CUT_EXTENSION,
// 明确穿出墙面(多切的是空气,视觉无痕);内部边保持原位,刀的终止面削出
// 的立面就是隔墙表面,与既有几何无重合对象。
import { floorBaseY, totalBuildingHeight } from './floorMath.js';
import { createFootprint } from './createFootprint.js';
import { createWallSegments } from './createWallSegments.js';
import { rectUnionToPolygons } from './rectUnion.js';

export const SLAB_THICKNESS = 0.15;
export const OPENING_CUT_EXTENSION = 0.5;

const EPS = 1e-4;

// 边 a-b 是否落在某面 footprint 墙上(轴对齐共线 + 区间包含)。
function edgeOnFootprint(a, b, walls) {
  for (const wall of walls) {
    const [sx, sz] = wall.start;
    const [ex, ez] = wall.end;
    if (Math.abs(sz - ez) < EPS) {
      if (Math.abs(a.z - sz) > EPS || Math.abs(b.z - sz) > EPS) continue;
      const lo = Math.min(sx, ex) - EPS, hi = Math.max(sx, ex) + EPS;
      if (a.x >= lo && a.x <= hi && b.x >= lo && b.x <= hi) return true;
    } else if (Math.abs(sx - ex) < EPS) {
      if (Math.abs(a.x - sx) > EPS || Math.abs(b.x - sx) > EPS) continue;
      const lo = Math.min(sz, ez) - EPS, hi = Math.max(sz, ez) + EPS;
      if (a.z >= lo && a.z <= hi && b.z >= lo && b.z <= hi) return true;
    }
  }
  return false;
}

function pointInLoop(px, pz, loop) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const xi = loop[i][0], zi = loop[i][1];
    const xj = loop[j][0], zj = loop[j][1];
    if ((zi > pz) !== (zj > pz)
      && px < ((xj - xi) * (pz - zi)) / ((zj - zi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

// 点是否在实心 footprint 内(外环内且不在任何洞环内)。
function insideFootprint(px, pz, footprint) {
  const outer = Array.isArray(footprint) ? footprint : footprint.outer;
  if (!pointInLoop(px, pz, outer)) return false;
  for (const hole of Array.isArray(footprint) ? [] : footprint.holes) {
    if (pointInLoop(px, pz, hole)) return false;
  }
  return true;
}

// 贴墙边 a-b 向 footprint 外侧凸出 amount:a-b 替换为 a, a+n, b+n, b。
// 外侧 = 边中点沿法线偏移后落在实心 footprint 之外的方向。
function bumpEdgeOutward(a, b, footprint, amount) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  let nx = -dz / len, nz = dx / len;
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  if (insideFootprint(mx + nx * EPS * 10, mz + nz * EPS * 10, footprint)) {
    nx = -nx; nz = -nz;
  }
  return [
    { x: a.x + nx * amount, z: a.z + nz * amount },
    { x: b.x + nx * amount, z: b.z + nz * amount }
  ];
}

// 观察区并集多边形 → 刀多边形:贴墙边外凸,内部边原样。
// openingEdges 记录外凸前的原始贴墙边,供洞口描边定位。
function toCutter(poly, footprint, walls) {
  const openingEdges = [];
  const bumpRing = ring => {
    const out = [];
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      out.push({ x: a.x, z: a.z });
      if (edgeOnFootprint(a, b, walls)) {
        openingEdges.push({ a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z } });
        const [pa, pb] = bumpEdgeOutward(a, b, footprint, OPENING_CUT_EXTENSION);
        out.push(pa, pb);
      }
    }
    return out;
  };
  return { outer: bumpRing(poly.outer), holes: (poly.holes ?? []).map(bumpRing), openingEdges };
}

export function buildSegmentSpecs(building) {
  const params = building.params;
  const totalH = totalBuildingHeight(params);
  const footprint = createFootprint(building.template, params);
  const walls = createWallSegments(footprint);

  // 按楼层聚合观察区 → 每个被占用楼层一个 band
  const byFloor = new Map();
  for (const area of building.observationAreas ?? []) {
    if (!(area.rects?.length > 0)) continue;
    if (!byFloor.has(area.floor)) byFloor.set(area.floor, []);
    byFloor.get(area.floor).push(area);
  }

  const bands = [...byFloor.entries()]
    .map(([floor, areas]) => {
      const fromY = floorBaseY({ floor, ...params }) + SLAB_THICKNESS;
      const nextBase = floor >= params.floors
        ? totalH
        : floorBaseY({ floor: floor + 1, ...params });
      const cutters = areas.flatMap(area =>
        rectUnionToPolygons(area.rects).map(poly => toCutter(poly, footprint, walls))
      );
      // 房间多边形(未外凸,即刀在 footprint 内挖出的真实空腔轮廓):顶层房间
      // 用它单独造顶盖 mesh,好让"揭盖"能把顶盖整块隐藏。
      const rooms = areas.flatMap(area => rectUnionToPolygons(area.rects));
      return { fromY, toY: nextBase, cutters, rooms };
    })
    .sort((a, b) => a.fromY - b.fromY);

  const specs = [];
  let cursor = 0;
  for (const band of bands) {
    if (band.fromY - cursor > EPS) specs.push({ fromY: cursor, toY: band.fromY, cutters: [], rooms: [] });
    specs.push(band);
    cursor = band.toY;
  }
  if (totalH - cursor > EPS) specs.push({ fromY: cursor, toY: totalH, cutters: [], rooms: [] });
  return specs;
}
