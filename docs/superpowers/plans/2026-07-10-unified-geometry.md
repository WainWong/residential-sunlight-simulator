# 统一几何(CSG 真挖洞)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建筑渲染几何成为单一真理源——所有建筑经同一条"分段 + CSG 减法"管线生成,洞真挖、房间真掏,删除房间网格/影子替身/洞口贴片三层胶水。

**Architecture:** 每栋楼 = 若干段上下叠放的实体网格。纯数学的分段/刀规格计算放在 domain 层(可无 three 单测);three-bvh-csg 布尔在 scene 层执行,输出的段网格替换 buildingMesh 里的单一拉伸体。共面风险靠"刀在洞边外扩 0.5m + 刀 y 区间超出段端面"在构造时消除。数值分析(worker/射线)完全不动。

**Tech Stack:** Vite + vanilla JS + three 0.185.0 + three-bvh-csg 0.0.18(peer: three-mesh-bvh)。测试 vitest(node 环境直接跑 three 几何)+ playwright。

**Spec:** `docs/superpowers/specs/2026-07-10-unified-geometry-design.md`

## Global Constraints

- Node >= 22.12;提交前 `npm test`、`npm run test:e2e`、`npm run build` 全绿。
- UI 文案中文、面向非技术用户;本轮无新增 UI 文案。
- 一个 commit 一个关注点。
- `OPENING_CUT_EXTENSION = 0.5`(米),命名常量,洞边刀外扩量。
- 楼板厚度 `SLAB_THICKNESS = 0.15`(米):观察层段的下端 = floorBaseY + 0.15,上端 = 下一层 floorBaseY(天花板即上段底面)。
- 已有约定:建筑局部坐标系 x/z,`ringToShape` 映射 (x, -z);`floorBaseY({floor, floorHeight, firstFloorHeight})`;`edgeOnFootprint` 语义 = 轴对齐共线 + 包含。

---

### Task 1: 安装依赖 + CSG 冒烟测试

**Files:**
- Modify: `package.json`
- Test: `tests/unit/csg-smoke.test.js`(临时,Task 3 完成后删除)

**Interfaces:**
- Produces: 依赖 `three-bvh-csg`、`three-mesh-bvh` 可用;确认 `Evaluator`/`Brush`/`SUBTRACTION` 在 node(vitest)环境工作。

- [ ] **Step 1: 安装依赖**

```bash
npm install three-bvh-csg@0.0.18 three-mesh-bvh
```

- [ ] **Step 2: 写冒烟测试**

```js
// tests/unit/csg-smoke.test.js
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

describe('three-bvh-csg smoke', () => {
  it('subtracts a box from a box in node', () => {
    const a = new Brush(new THREE.BoxGeometry(4, 4, 4));
    const b = new Brush(new THREE.BoxGeometry(2, 6, 2)); // 贯穿 → 挖出方孔
    a.updateMatrixWorld();
    b.updateMatrixWorld();
    const result = new Evaluator().evaluate(a, b, SUBTRACTION);
    const pos = result.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    // 射线从孔正上方垂直向下:应从孔内壁穿过,不命中顶面中心
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    result.updateMatrixWorld();
    const hits = ray.intersectObject(result, false);
    // 方孔贯穿 → 中心线上没有任何面
    expect(hits.length).toBe(0);
  });
});
```

- [ ] **Step 3: 运行确认通过**

Run: `npx vitest run tests/unit/csg-smoke.test.js`
Expected: PASS(若 import 失败或 evaluate 抛错,说明版本不兼容,停下来排查)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tests/unit/csg-smoke.test.js
git commit -m "chore(deps): add three-bvh-csg for unified building geometry"
```

---

### Task 2: domain 层分段/刀规格计算(纯数学)

**Files:**
- Create: `src/domain/buildings/segmentBuilding.js`
- Test: `tests/unit/segment-building.test.js`

**Interfaces:**
- Consumes: `floorBaseY`, `totalBuildingHeight`(`src/domain/buildings/floorMath.js`);`createFootprint`(`createFootprint.js`);`createWallSegments`(`createWallSegments.js`,返回 `[{start:[x,z], end:[x,z]}]`);`rectUnionToPolygons`(`rectUnion.js`,返回 `[{outer:[{x,z}...], holes:[[{x,z}...]]}]`)。
- Produces:
  - `SLAB_THICKNESS = 0.15`、`OPENING_CUT_EXTENSION = 0.5`(具名导出常量)
  - `buildSegmentSpecs(building) → [{ fromY, toY, cutters }]`,按 y 升序;`cutters: [{ outer:[{x,z}...], holes:[[{x,z}...]] }]`,其中与 footprint 墙重合的边已向外凸出 `OPENING_CUT_EXTENSION`(边 a-b 替换为 a, a+n, b+n, b 四点,n 为朝 footprint 外侧的法向偏移)。无观察区建筑 → 单段零刀。

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/segment-building.test.js
import { describe, expect, it } from 'vitest';
import {
  buildSegmentSpecs, SLAB_THICKNESS, OPENING_CUT_EXTENSION
} from '../../src/domain/buildings/segmentBuilding.js';

const bar = (areas = []) => ({
  id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
  params: { length: 60, depth: 18, floors: 6, floorHeight: 3 },
  observationAreas: areas
});
// bar footprint: x ∈ [-30, 30], z ∈ [-9, 9](createFootprint 以中心为原点)

describe('buildSegmentSpecs', () => {
  it('building without areas yields one full-height segment, no cutters', () => {
    const specs = buildSegmentSpecs(bar());
    expect(specs).toEqual([{ fromY: 0, toY: 18, cutters: [] }]);
  });

  it('splits into below / band / above around the occupied floor', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]));
    // floor 2: baseY = 3, next floor base = 6
    expect(specs.map(s => [s.fromY, s.toY])).toEqual([
      [0, 3 + SLAB_THICKNESS], [3 + SLAB_THICKNESS, 6], [6, 18]
    ]);
    expect(specs[0].cutters).toEqual([]);
    expect(specs[1].cutters).toHaveLength(1);
    expect(specs[2].cutters).toEqual([]);
  });

  it('bumps opening edges outward, keeps interior edges in place', () => {
    // 观察区南边贴在 footprint 南墙上 (z = -9),其余三边在楼内部
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -9, x1: 8, z1: 0 }] }
    ]));
    const cutter = specs[1].cutters[0];
    const zs = cutter.outer.map(p => p.z);
    // 贴墙边被推到墙外(南 = -z 方向)
    expect(Math.min(...zs)).toBeCloseTo(-9 - OPENING_CUT_EXTENSION, 6);
    // 内部边纹丝不动
    expect(Math.max(...zs)).toBeCloseTo(0, 6);
    expect(Math.min(...cutter.outer.map(p => p.x))).toBeCloseTo(-8, 6);
    expect(Math.max(...cutter.outer.map(p => p.x))).toBeCloseTo(8, 6);
  });

  it('top-floor area band ends at building top', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 6, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]));
    // floor 6: baseY = 15, 顶 = 18 → 上段不存在
    expect(specs.map(s => [s.fromY, s.toY])).toEqual([
      [0, 15 + SLAB_THICKNESS], [15 + SLAB_THICKNESS, 18]
    ]);
  });

  it('two areas on different floors yield five segments', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] },
      { id: 'a2', floor: 4, rects: [{ x0: 10, z0: -6, x1: 20, z1: 6 }] }
    ]));
    expect(specs.map(s => [s.fromY, s.toY])).toEqual([
      [0, 3 + SLAB_THICKNESS], [3 + SLAB_THICKNESS, 6],
      [6, 9 + SLAB_THICKNESS], [9 + SLAB_THICKNESS, 12], [12, 18]
    ]);
  });

  it('same-floor areas share one band with two cutters', () => {
    const specs = buildSegmentSpecs(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: -2, z1: 6 }] },
      { id: 'a2', floor: 2, rects: [{ x0: 2, z0: -6, x1: 8, z1: 6 }] }
    ]));
    expect(specs).toHaveLength(3);
    expect(specs[1].cutters).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/segment-building.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

```js
// src/domain/buildings/segmentBuilding.js
// 把一栋楼切成若干上下叠放的实体段,并为含观察区的段生成"刀"
// (挖房间空腔的棱柱多边形)。纯数学,无 three.js,供 scene 层执行 CSG。
import { floorBaseY, totalBuildingHeight } from './floorMath.js';
import { createFootprint } from './createFootprint.js';
import { createWallSegments } from './createWallSegments.js';
import { rectUnionToPolygons } from './rectUnion.js';

export const SLAB_THICKNESS = 0.15;
export const OPENING_CUT_EXTENSION = 0.5;

const EPS = 1e-4;

// 与 scene 层 edgeOnFootprint 同语义:边 a-b 是否落在某面 footprint 墙上
// (轴对齐共线 + 区间包含)。
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
    const xi = loop[i][0] ?? loop[i].x, zi = loop[i][1] ?? loop[i].z;
    const xj = loop[j][0] ?? loop[j].x, zj = loop[j][1] ?? loop[j].z;
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
function toCutter(poly, footprint, walls) {
  const bumpRing = ring => {
    const out = [];
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      out.push({ x: a.x, z: a.z });
      if (edgeOnFootprint(a, b, walls)) {
        const [pa, pb] = bumpEdgeOutward(a, b, footprint, OPENING_CUT_EXTENSION);
        out.push(pa, pb);
      }
    }
    return out;
  };
  return { outer: bumpRing(poly.outer), holes: (poly.holes ?? []).map(bumpRing) };
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
      return { fromY, toY: nextBase, cutters };
    })
    .sort((a, b) => a.fromY - b.fromY);

  const specs = [];
  let cursor = 0;
  for (const band of bands) {
    if (band.fromY - cursor > EPS) specs.push({ fromY: cursor, toY: band.fromY, cutters: [] });
    specs.push(band);
    cursor = band.toY;
  }
  if (totalH - cursor > EPS) specs.push({ fromY: cursor, toY: totalH, cutters: [] });
  return specs;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/segment-building.test.js`
Expected: PASS(若 `createFootprint('bar', ...)` 的坐标范围假设不符,先 `console.log` 实际 footprint 修正测试常量,不改实现语义)

- [ ] **Step 5: Commit**

```bash
git add src/domain/buildings/segmentBuilding.js tests/unit/segment-building.test.js
git commit -m "feat(domain): segment specs with outward-bumped opening cutters"
```

---

### Task 3: scene 层 CSG 段网格构造

**Files:**
- Create: `src/scene/buildSegmentMeshes.js`
- Test: `tests/unit/segment-meshes.test.js`
- Delete: `tests/unit/csg-smoke.test.js`(被本任务测试取代)

**Interfaces:**
- Consumes: `buildSegmentSpecs`、`SLAB_THICKNESS`(Task 2);`createFootprint`;`getOuterRing`(`buildingSceneHelpers.js`)。
- Produces: `buildSegmentMeshes(building, material) → { meshes, frames }`
  - `meshes: THREE.Mesh[]`,每段一个;`mesh.userData = { kind: 'building-segment', entityId: building.id, fromY, toY, hasCutters }`;castShadow/receiveShadow 由调用方设置。
  - `frames: THREE.LineLoop[]`,金色洞口描边(每条贴墙洞边一个,y ∈ [fromY+0.02, toY-0.02]),`userData.kind = 'opening-frame'`。
  - 网格几何在建筑局部坐标系(调用方负责 applyBuildingTransform)。

- [ ] **Step 1: 写失败测试**

```js
// tests/unit/segment-meshes.test.js
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildSegmentMeshes } from '../../src/scene/buildSegmentMeshes.js';

const material = new THREE.MeshStandardMaterial();
const bar = (areas = []) => ({
  id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
  params: { length: 60, depth: 18, floors: 6, floorHeight: 3 },
  observationAreas: areas
});

function raycast(meshes, origin, dir) {
  const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize());
  meshes.forEach(m => m.updateMatrixWorld());
  return ray.intersectObjects(meshes, false);
}

describe('buildSegmentMeshes', () => {
  it('no-area building → single segment, zero frames', () => {
    const { meshes, frames } = buildSegmentMeshes(bar(), material);
    expect(meshes).toHaveLength(1);
    expect(frames).toHaveLength(0);
    expect(meshes[0].userData).toMatchObject({ kind: 'building-segment', entityId: 'b1' });
  });

  it('cuts a real hole where the area meets the exterior wall', () => {
    // 区南边贴南墙 z=-9 → 洞;水平射线沿 -z 从楼外指向楼内,穿过洞的高度
    const { meshes } = buildSegmentMeshes(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -9, x1: 8, z1: 0 }] }
    ]), material);
    const hitsThroughHole = raycast(meshes, [0, 4.5, -20], [0, 0, 1]);
    // 首个命中不再是南墙 (z≈-9),而是房间对面的实体(北侧,z≈0 之后)
    expect(hitsThroughHole.length).toBeGreaterThan(0);
    expect(hitsThroughHole[0].point.z).toBeGreaterThan(-1);
    // 洞外(x=20 处南墙完好)仍被墙挡住
    const hitsAtWall = raycast(meshes, [20, 4.5, -20], [0, 0, 1]);
    expect(hitsAtWall[0].point.z).toBeCloseTo(-9, 1);
  });

  it('keeps the floor slab under the room (vertical ray hits slab top)', () => {
    const { meshes } = buildSegmentMeshes(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]), material);
    const hits = raycast(meshes, [0, 5.9, 0], [0, -1, 0]);
    // 房间内部垂直向下:穿过空腔,命中楼板顶 y = 3 + 0.15
    expect(hits[0].point.y).toBeCloseTo(3.15, 2);
  });

  it('ceiling above the room blocks a vertical ray from the sky', () => {
    const { meshes } = buildSegmentMeshes(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]), material);
    const hits = raycast(meshes, [0, 30, 0], [0, -1, 0]);
    // 上段底面(天花板)在 y = 6;首个命中是楼顶 y = 18
    expect(hits[0].point.y).toBeCloseTo(18, 2);
  });

  it('emits one gold frame per opening edge', () => {
    const { frames } = buildSegmentMeshes(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -9, x1: 8, z1: 0 }] }
    ]), material);
    expect(frames).toHaveLength(1);
    expect(frames[0].userData.kind).toBe('opening-frame');
  });

  it('ring-shaped area keeps its inner island solid', () => {
    // 回形区:外 20×12,内岛 6×4 → 岛屿是实体,垂直射线命中岛顶(band 顶 y=6)
    const { meshes } = buildSegmentMeshes(bar([{
      id: 'a1', floor: 2, rects: [
        { x0: -10, z0: -6, x1: 10, z1: -2 }, { x0: -10, z0: 2, x1: 10, z1: 6 },
        { x0: -10, z0: -2, x1: -3, z1: 2 }, { x0: 3, z0: -2, x1: 10, z1: 2 }
      ]
    }]), material);
    const hits = raycast(meshes, [0, 5.9, 0], [0, -1, 0]);
    // (0,0) 在内岛上 → 命中岛体顶部(y ≈ 6,band 上端),而不是楼板 3.15
    expect(hits[0].point.y).toBeGreaterThan(5.5);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/segment-meshes.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: 实现**

```js
// src/scene/buildSegmentMeshes.js
// 把 domain 层的分段规格执行成真实网格:每段一个拉伸体,有刀的段用
// three-bvh-csg 做减法(真挖洞/掏房间)。刀已在 domain 层消除共面
// (洞边外扩);这里再让刀的 y 区间超出段端面,保证上下端面也无共面布尔。
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { buildSegmentSpecs } from '../domain/buildings/segmentBuilding.js';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { getOuterRing } from './buildingSceneHelpers.js';

const CUT_Y_OVERSHOOT = 0.5;

const openingFrameMaterial = new THREE.LineBasicMaterial({
  color: 0xf1b746, transparent: true, opacity: 0.95
});

function ringToShape(target, ring, toXY) {
  ring.forEach((p, i) => {
    const [x, y] = toXY(p);
    if (i === 0) target.moveTo(x, y); else target.lineTo(x, y);
  });
  target.closePath();
}

function footprintShape(footprint) {
  const shape = new THREE.Shape();
  ringToShape(shape, getOuterRing(footprint), ([x, z]) => [x, -z]);
  for (const hole of Array.isArray(footprint) ? [] : footprint.holes) {
    const path = new THREE.Path();
    ringToShape(path, hole, ([x, z]) => [x, -z]);
    shape.holes.push(path);
  }
  return shape;
}

function cutterShape(cutter) {
  const shape = new THREE.Shape();
  ringToShape(shape, cutter.outer, p => [p.x, -p.z]);
  for (const hole of cutter.holes ?? []) {
    const path = new THREE.Path();
    ringToShape(path, hole, p => [p.x, -p.z]);
    shape.holes.push(path);
  }
  return shape;
}

function extrudeY(shape, fromY, toY) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: toY - fromY, steps: 1, bevelEnabled: false
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, fromY, 0);
  return geometry;
}

function segmentGeometry(spec, footprint) {
  const shell = extrudeY(footprintShape(footprint), spec.fromY, spec.toY);
  if (spec.cutters.length === 0) return shell;
  const evaluator = new Evaluator();
  let brush = new Brush(shell);
  brush.updateMatrixWorld();
  for (const cutter of spec.cutters) {
    // 刀 y 区间上下各超出段端面 CUT_Y_OVERSHOOT:段外没有材料,
    // 多切的是空气,但消除了刀端面与段端面的共面分类。
    const knife = new Brush(extrudeY(
      cutterShape(cutter), spec.fromY - CUT_Y_OVERSHOOT, spec.toY + CUT_Y_OVERSHOOT
    ));
    knife.updateMatrixWorld();
    const next = evaluator.evaluate(brush, knife, SUBTRACTION);
    brush.geometry.dispose();
    knife.geometry.dispose();
    brush = next;
    brush.updateMatrixWorld();
  }
  const geometry = brush.geometry;
  geometry.computeVertexNormals();
  return geometry;
}

// 洞口描边:观察区并集边界上贴 footprint 墙的边(即被外扩前的原始边)。
// domain 层刀里贴墙边已被推到墙外;描边要贴在墙面原位,所以由
// buildSegmentSpecs 之外的原始信息重建 — 直接扫描刀 outer 环里
// "被外扩的矩形凸起":凸起的内侧两点就是洞的原始端点。为免解谜式反推,
// domain 层在 cutter 上同时带出 openingEdges(见 Step 3b 的小改动)。
function frameForEdge(edge, fromY, toY) {
  const { a, b } = edge;
  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, fromY + 0.02, a.z),
      new THREE.Vector3(b.x, fromY + 0.02, b.z),
      new THREE.Vector3(b.x, toY - 0.02, b.z),
      new THREE.Vector3(a.x, toY - 0.02, a.z)
    ]),
    openingFrameMaterial
  );
  frame.userData.kind = 'opening-frame';
  return frame;
}

export function buildSegmentMeshes(building, material) {
  const specs = buildSegmentSpecs(building);
  const footprint = createFootprint(building.template, building.params);
  const meshes = [];
  const frames = [];
  for (const spec of specs) {
    const mesh = new THREE.Mesh(segmentGeometry(spec, footprint), material);
    mesh.userData = {
      kind: 'building-segment', entityId: building.id,
      fromY: spec.fromY, toY: spec.toY, hasCutters: spec.cutters.length > 0
    };
    meshes.push(mesh);
    for (const cutter of spec.cutters) {
      for (const edge of cutter.openingEdges ?? []) {
        frames.push(frameForEdge(edge, spec.fromY, spec.toY));
      }
    }
  }
  return { meshes, frames };
}
```

- [ ] **Step 3b: domain 小改动 — cutter 带出 openingEdges**

在 `src/domain/buildings/segmentBuilding.js` 的 `toCutter` 里同时收集原始贴墙边:

```js
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
```

并在 `tests/unit/segment-building.test.js` 补断言(贴南墙用例):

```js
    expect(cutter.openingEdges).toHaveLength(1);
    expect(cutter.openingEdges[0].a.z).toBeCloseTo(-9, 6);
```

- [ ] **Step 4: 运行两个测试文件确认通过,删除冒烟测试**

Run: `npx vitest run tests/unit/segment-meshes.test.js tests/unit/segment-building.test.js`
Expected: PASS

```bash
rm tests/unit/csg-smoke.test.js
```

- [ ] **Step 5: Commit**

```bash
git add -A src/scene/buildSegmentMeshes.js src/domain/buildings/segmentBuilding.js tests/unit
git commit -m "feat(scene): CSG segment meshes with real openings and gold frames"
```

---

### Task 4: buildingMesh 接入分段管线

**Files:**
- Modify: `src/scene/buildingMesh.js`
- Test: `tests/unit/scene-sync.test.js`(现有,确认不回归)、`tests/unit/picking.test.js`(现有)

**Interfaces:**
- Consumes: `buildSegmentMeshes(building, material)`(Task 3)。
- Produces: `createBuildingMesh(building, { preview, highlighted })` 签名不变,返回 group;group 内不再是单个 `building-solid`,而是若干 `building-segment` mesh + `opening-frame` LineLoop + `floor-lines`。每个 segment mesh 均有 `userData.entityId`(picking 依赖)。

- [ ] **Step 1: 修改 createBuildingMesh**

`src/scene/buildingMesh.js` 中,保留三个材质与 `floorLines`,删除本文件的 `ringToShape`/`footprintShape` 与整体 Extrude(它们迁进了 buildSegmentMeshes),函数体改为:

```js
import { buildSegmentMeshes } from './buildSegmentMeshes.js';

export function createBuildingMesh(building, { preview = false, highlighted = false } = {}) {
  const footprint = createFootprint(building.template, building.params);
  const height = totalBuildingHeight(building.params);
  const material = preview ? blueprintMaterial : (highlighted ? highlightMaterial : buildingMaterial);

  const group = new THREE.Group();
  group.name = `building:${building.id}`;
  group.userData.entityId = building.id;
  group.userData.revision = building.revision ?? 0;
  group.userData.preview = preview;
  group.userData.highlighted = !preview && highlighted;
  group.userData.totalHeight = height;
  applyBuildingTransform(group, building);

  const { meshes, frames } = buildSegmentMeshes(building, material);
  for (const mesh of meshes) {
    mesh.castShadow = !preview;
    mesh.receiveShadow = !preview;
    group.add(mesh);
  }
  for (const frame of frames) group.add(frame);

  const lines = floorLines(footprint, building);
  if (lines) group.add(lines);

  group.userData.dispose = () => {
    group.traverse(child => child.geometry?.dispose());
  };
  return group;
}
```

- [ ] **Step 2: 跑现有场景相关单测**

Run: `npx vitest run tests/unit/scene-sync.test.js tests/unit/picking.test.js`
Expected: PASS。若 picking 测试依赖 `kind: 'building-solid'`,把断言对象换成 `building-segment`(resolvePickedEntity 只看 `entityId`,大概率无需改)。

- [ ] **Step 3: 本地起 dev server 目检**

Run: `npm run dev`,检查:无观察区建筑外观与之前一致;有观察区的建筑在室外视角能看见墙上的真洞 + 金色描边;编辑阶段一切照旧。

- [ ] **Step 4: Commit**

```bash
git add src/scene/buildingMesh.js tests/unit
git commit -m "feat(scene): buildings render through the segmented CSG pipeline"
```

---

### Task 5: 室内进入/退出改用统一几何,删除三层胶水

**Files:**
- Modify: `src/scene/createSceneController.js`
- Delete: `src/scene/interiorFloor.js`、`src/scene/openingOverlay.js`
- Modify: `src/scene/analysisOverlays.js`(去掉 openings 输出)
- Delete/Modify tests: 删 `tests/unit/interior-floor.test.js`、`tests/unit/opening-overlay.test.js`(如存在;先 `ls tests/unit` 确认实际文件名)

**Interfaces:**
- Consumes: 段网格 `userData: { kind:'building-segment', fromY, toY, entityId }`(Task 4)。
- Produces: `enterInterior/exitInterior` 外部签名不变(main.js 不改)。

- [ ] **Step 1: 改写 enterInterior/exitInterior/updateOcclusion**

`src/scene/createSceneController.js`:

1. 删 import:`createInteriorFloor, createHostShadowGhost`(interiorFloor.js)、`createOpeningOverlay`(openingOverlay.js)。
2. `enterInterior` 不再隐藏 host、不再建房间/替身;fades 建在 host 建筑的段网格上:

```js
  function hostSegmentMeshes(buildingId) {
    const meshes = [];
    for (const child of sceneParts.buildings.children) {
      if (child.userData?.entityId !== buildingId) continue;
      child.traverse(m => {
        if (m.userData?.kind === 'building-segment') meshes.push(m);
      });
    }
    return meshes;
  }

  function enterInterior({ building, floor, area, center, radius }) {
    if (interior) exitInterior();
    const segments = hostSegmentMeshes(building.id);
    const fades = new Map();
    for (const mesh of segments) {
      // 段共享材质 → 每段克隆一份,退出时恢复
      mesh.userData.sharedMaterial = mesh.material;
      mesh.material = mesh.material.clone();
      mesh.material.transparent = true;
      fades.set(mesh, createFadeState());
    }
    cameraParts.flyToArea({ center, radius });
    const totalH = totalBuildingHeight(building.params);
    const shadowHalf = Math.max(60, radius * 3, totalH * 1.6);
    const light = sceneParts.sunlight;
    light.shadow.mapSize.set(4096, 4096);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    const hemi = sceneParts.scene.getObjectByName('ambient-sky');
    if (hemi) hemi.intensity = 0.9;
    const ceilingY = center.y + building.params.floorHeight / 2;
    interior = {
      buildingId: building.id, fades, shadowHalf, ceilingY,
      center: new THREE.Vector3(center.x, center.y, center.z)
    };
    frameShadowsOnInterior();
  }

  function exitInterior() {
    if (!interior) return;
    for (const [mesh] of interior.fades) {
      mesh.material.dispose();
      mesh.material = mesh.userData.sharedMaterial;
      delete mesh.userData.sharedMaterial;
    }
    const hemi = sceneParts.scene.getObjectByName('ambient-sky');
    if (hemi) hemi.intensity = 1.5;
    cameraParts.setEditControls(null);
    interior = null;
    restoreShadowFrame();
  }
```

3. `updateOcclusion`:天花板规则作用于"fromY ≥ 观察层顶的段"(上段),raycast 淡出作用于观察层段:

```js
  function updateOcclusion() {
    if (!interior) return;
    const camPos = cameraParts.camera.position;
    _camToCenter.copy(interior.center).sub(camPos);
    const centerDist = _camToCenter.length();
    _hit.set(camPos, _camToCenter.clone().normalize());
    const meshes = [...interior.fades.keys()];
    const hits = _hit.intersectObjects(meshes, false);
    const occluders = new Set(hits.filter(h => h.distance < centerDist - 0.5).map(h => h.object));
    const aboveCeiling = camPos.y > interior.ceilingY;
    for (const [mesh, fade] of interior.fades) {
      // 上段(天花板及以上)用连续的相机高度规则,避免掠射角 raycast 闪烁
      const isAbove = mesh.userData.fromY >= interior.ceilingY - 0.5;
      const occluding = isAbove ? aboveCeiling : occluders.has(mesh);
      const next = fade.update(mesh.material.opacity, occluding);
      mesh.material.opacity = isAbove && occluding && next <= 0.16 ? 0 : next;
    }
  }
```

注意:段网格重建(revision 变化)会使 fades 里的 mesh 失效。在 `updateProject` 里,`synchronizer.update(...)` 之后加:

```js
      if (interior) {
        const alive = new Set(hostSegmentMeshes(interior.buildingId));
        const stale = [...interior.fades.keys()].some(m => !alive.has(m));
        if (stale) {
          for (const [mesh] of interior.fades) {
            if (mesh.userData.sharedMaterial) {
              mesh.material.dispose();
              mesh.material = mesh.userData.sharedMaterial;
              delete mesh.userData.sharedMaterial;
            }
          }
          interior.fades = new Map();
          for (const mesh of alive) {
            mesh.userData.sharedMaterial = mesh.material;
            mesh.material = mesh.material.clone();
            mesh.material.transparent = true;
            interior.fades.set(mesh, createFadeState());
          }
        }
      }
```

- [ ] **Step 2: analysisOverlays 去掉 openings**

`src/scene/analysisOverlays.js`:`buildAnalysisOverlays` 返回值删除 `openings` 字段及其推导(`deriveAperturesFromArea` 在此文件的调用如仅服务 overlays 则一并删;若 worker/analysis 也用,保留 domain 侧)。`createSceneController.updateAnalysis` 删除:

```js
      for (const opening of overlays.openings) {
        sceneParts.overlays.add(createOpeningOverlay(opening));
      }
```

- [ ] **Step 3: 删文件**

```bash
rm src/scene/interiorFloor.js src/scene/openingOverlay.js
ls tests/unit | grep -iE 'interior-floor|opening-overlay'  # 存在则一并 rm
```

全局搜索确认无残留引用:

```bash
grep -rn "interiorFloor\|openingOverlay\|createOpeningOverlay\|createHostShadowGhost\|createInteriorFloor" src tests
```

Expected: 无输出。

- [ ] **Step 4: 全量单测 + 目检**

Run: `npm test`
Expected: PASS(涉及 analysisOverlays 的测试若断言 openings,更新之)

`npm run dev` 目检:进入室内 → 相机飞入,阳光从真洞射入,地板/天花板/隔墙都是建筑本体;抬高相机,上段淡出露出房间;室外视角洞与描边可见;退出恢复。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scene): interior view runs on unified geometry; drop room mesh, shadow ghost, opening overlay"
```

---

### Task 6: 外扩三档演示 + e2e + 收尾

**Files:**
- Modify: `tests/e2e/interior-daylight.spec.js`(补室外洞可见断言)
- Test: 全套

**Interfaces:**
- Consumes: 全部前序任务。

- [ ] **Step 1: e2e 补断言**

`tests/e2e/interior-daylight.spec.js` 的 SEED 观察区改为贴墙(产生洞):`rects: [{ x0: -8, z0: -9, x1: 8, z1: 0 }]`,并在现有断言后追加(canvas 内容无法直接断言,退而断言进入/退出全流程不报错 + 截图留档):

```js
  await page.screenshot({ path: 'test-results/interior-unified.png' });
  await enter.click(); // 再点一次退出
  await expect(enter).toHaveText('进入');
```

(若"再点一次"当前语义不是退出,查 DesktopShell 的按钮行为,按实际语义写退出断言。)

- [ ] **Step 2: 外扩三档对比演示**

`npm run dev`,把 `src/domain/buildings/segmentBuilding.js` 的 `OPENING_CUT_EXTENSION` 临时改 0 → 0.05 → 0.5,各截一张室外洞口特写 + 一张室内洞口特写给用户对比;演示后恢复 0.5。预期:0.05 与 0.5 完全一致;0 档可能出现闪烁膜(也可能当场看不出——向用户说明这正是间歇性风险)。

- [ ] **Step 3: 全套验证**

```bash
npm test && npm run build && npm run test:e2e
```

Expected: 全绿(area-topdown 的 2 个 drag 用例在 master 上即为 flaky,失败不算回归)。

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/interior-daylight.spec.js
git commit -m "test(e2e): interior flow over unified geometry with real wall opening"
```

---

## Self-Review

- Spec 覆盖:分段管线(T2/T3/T4)、共面消除表(T2 外扩 + T3 y 超切)、删除清单(T5)、进入室内行为(T5)、金色描边(T3)、数值分析不动(无任务改 domain/simulation ✓)、三档演示(T6)、测试计划(各任务 + T6)。楼层参考线/预览材质/拾取:T4 保留。
- 占位符:无 TBD;T6 e2e 退出语义留了查证指引(依赖运行时行为,非占位)。
- 类型一致性:`buildSegmentSpecs` 返回 `{fromY, toY, cutters}`、cutter `{outer, holes, openingEdges}` 在 T2/T3 一致;`buildSegmentMeshes(building, material) → {meshes, frames}` 在 T3/T4 一致;`userData.{kind, entityId, fromY, toY}` 在 T3/T5 一致。
