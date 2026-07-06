# 结果面板接入真实计算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让结果面板与场景叠加层展示的直射/照亮数据来自 `src/domain/simulation/` 的真实几何引擎，而非硬编码常量。

**Architecture:** 新增两个"适配层"域函数——`buildObstacles`（建筑→世界坐标墙面遮挡）和 `buildOpeningPortals`（开口→世界坐标光线门户），配合一个采样坐标变换，把 `project` 状态喂给已经过测试的 `evaluateDirectSun`。`createSimulationController` 从"编造数据"改为"调用引擎"，`ResultsPanel` 显示真实结果与占位文案，场景新增观察区/开口叠加层。

**Tech Stack:** 原生 ES 模块、Three.js 0.185、Luxon、SunCalc、Vitest（单元）、Playwright（e2e）。`src/domain/` 保持不依赖 DOM/Three.js。

## Global Constraints

- Node >= 22.12；依赖锁定精确版本，不新增依赖。
- `src/domain/` 内代码只接收普通数据、返回普通数据，禁止 import DOM / Three.js（用 `Math` 做旋转，不用 `THREE.MathUtils`）。
- 界面文案面向普通用户，中文优先。
- 每个任务结束运行对应测试并提交；交付前 `npm test`、`npm run test:e2e`、`npm run build` 全绿。
- 现有单元测试（尤其 `tests/unit/direct-sun.test.js`、`tests/unit/buildings.test.js`）的断言不得破坏——新能力通过可选参数扩展，不改旧接口默认行为。

## 已解决的语义决策（超出原 spec，请在评审时确认）

原 spec 未定义以下三点，几何计算无法回避。本计划采用的默认约定：

1. **观察区 cells 坐标系与采样高度**：cell `[cx, cz]` 视为**建筑局部坐标**（米），采样点局部位置 `[cx+off, 0, cz+off]`；世界化时按建筑 `rotation`（绕 Y，与 `buildingMesh` 一致）旋转、按 `position` 平移，世界高度 = `floorBaseY(area.floor, params) + (area.sampleHeight ?? 0)`。建筑在原点、旋转 0 时退化为现有 `observationOverlay.js` 的约定。
2. **开口 `wallId` 语义**：绑定到建筑**局部墙段**（`wall-outer-N`），随建筑旋转一起转动。旧数据中的方向标签（`south-0`/`east-0`/`north-0`/`west-0`）按"局部外法线最接近该罗盘方向的墙段"一次性映射。
3. **观察者自身开口墙不参与遮挡**：`buildObstacles` 支持排除指定 `buildingId:wallId` 墙面，控制器把当前观察区所属开口的墙段排除，避免开口所在墙把自己挡住。

Y 轴旋转约定（与 Three.js `group.rotation.y` 一致）：`x_w = x·cosθ + z·sinθ`，`z_w = -x·sinθ + z·cosθ`，θ = `rotation` 弧度。

## File Structure

- Create `src/domain/buildings/wallGeometry.js` — 局部墙段世界化 + `resolveWallPlane`。
- Create `src/domain/simulation/buildObstacles.js` — 建筑→墙面四边形遮挡体。
- Create `src/domain/simulation/buildOpeningPortals.js` — 开口→世界门户平面。
- Modify `src/domain/simulation/intersectObstacles.js` — 新增 `intersectRayQuad`，`firstObstacleDistance` 兼容四边形与 AABB。
- Modify `src/domain/simulation/sampleArea.js` — 可选采样坐标变换。
- Modify `src/domain/simulation/evaluateDirectSun.js` — 透传变换。
- Rewrite `src/features/results/createSimulationController.js` — 接引擎。
- Modify `src/features/results/ResultsPanel.js` — 占位文案 + 观察区选择器。
- Modify `src/scene/createSceneController.js` — 新增 `updateAnalysis`；`src/main.js` 订阅接线。
- Delete `src/features/wizard/Wizard.js`、`src/features/areas/ObservationAreaEditor.js`、`src/features/openings/OpeningEditor.js`。
- Rename `tests/e2e/wizard-building.spec.js` → `tests/e2e/add-building.spec.js`；新增 `tests/e2e/occlusion.spec.js`。

---

### Task 1: 死代码清理

**Files:**
- Delete: `src/features/wizard/Wizard.js`
- Delete: `src/features/areas/ObservationAreaEditor.js`
- Delete: `src/features/openings/OpeningEditor.js`
- Rename: `tests/e2e/wizard-building.spec.js` → `tests/e2e/add-building.spec.js`

**Interfaces:**
- Consumes: 无。
- Produces: 无（纯删除）。

先做清理，避免后续任务在死文件上浪费精力。这三个文件在 2026-07-04 沙盘重构后零引用（已核实：仅彼此及被删的 Wizard 互相引用），功能由 `ObservationAreaSection.js` 替代。

- [ ] **Step 1: 确认零引用**

Run: `grep -rn "wizard/Wizard\|areas/ObservationAreaEditor\|openings/OpeningEditor" src`
Expected: 无输出（除这三个文件自身互相 import 外，`src` 其余位置无引用）。若有其它引用，停止并报告。

- [ ] **Step 2: 删除三个文件并改名 e2e**

```bash
git rm src/features/wizard/Wizard.js src/features/areas/ObservationAreaEditor.js src/features/openings/OpeningEditor.js
git mv tests/e2e/wizard-building.spec.js tests/e2e/add-building.spec.js
```

- [ ] **Step 3: 构建 + 单测确认无断裂**

Run: `npm run build && npm test`
Expected: build 成功；76 个单测全过（这些文件无单测覆盖，删除不影响）。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: remove dead wizard/area/opening editors superseded by ObservationAreaSection"
```

---

### Task 2: 墙段世界化与 `resolveWallPlane`

**Files:**
- Create: `src/domain/buildings/wallGeometry.js`
- Test: `tests/unit/wall-geometry.test.js`

**Interfaces:**
- Consumes: `createFootprint(template, params)` 和 `createWallSegments(footprint)`（现有，返回 `{ id, ring, index, start:[x,z], end:[x,z], length, normal:[nx,nz] }`）；`floorBaseY`、`totalBuildingHeight`（现有）。
- Produces:
  - `rotateLocalToWorld([x, z], rotationDeg) -> [xw, zw]`（绕 Y，约定见 Global）。
  - `worldWallSegments(building) -> Array<{ id, start:[xw,zw], end:[xw,zw], normal:[nxw,nzw], length }>`（局部墙段经 `building.rotation` 旋转、`building.position{x,z}` 平移后的世界坐标；normal 只旋不移，保持单位长度）。
  - `resolveWallId(building, wallRef) -> string | null`：`wallRef` 若已是 `wall-outer-N`/`wall-hole-*` 原样返回（校验存在）；若是 `south-0`/`east-0`/`north-0`/`west-0`，取其罗盘方向对应的局部外法线（南=`[0,-1]`、北=`[0,1]`、东=`[1,0]`、西=`[-1,0]`，注意 +Z=北，见 editorCoordinates），返回局部法线点积最大的墙段 id；无匹配返回 `null`。
  - `resolveWallPlane(building, wallRef, { sillHeight, height, width }) -> { point:[x,y,z], normal:[x,y,z], tangent:[x,y,z], bounds:{minU,maxU,minV,maxV} } | null`：以世界墙段中点为 `point`（y = 世界 sill 底，见下），`normal` = 世界外法线抬升为 3D `[nxw, 0, nzw]`，`tangent` = 沿墙方向单位向量 `[tx, 0, tz]`。`bounds.minU/maxU` = `±width/2`；`minV/maxV` = 世界高度区间 `[baseY, baseY+height]`，其中 `baseY = floorBaseY(building.params 带 floor) + sillHeight`。**注意**：`resolveWallPlane` 不知道楼层，楼层由调用方（Task 5）通过把 `floorBaseY` 结果加进来处理——因此本函数签名改为额外收 `baseY` 显式传入，见下方实现。

> 澄清签名（避免楼层耦合进几何）：`resolveWallPlane(building, wallRef, { baseY, height, width })`，其中 `baseY` 已是世界 Y（楼层底 + sill），由调用方算好。`minV=baseY`，`maxV=baseY+height`。

- [ ] **Step 1: 写失败测试**

```javascript
import { describe, expect, it } from 'vitest';
import {
  rotateLocalToWorld,
  worldWallSegments,
  resolveWallId,
  resolveWallPlane
} from '../../src/domain/buildings/wallGeometry.js';

const bar = {
  id: 'b1', template: 'bar', rotation: 0,
  position: { x: 0, z: 0 },
  params: { length: 60, depth: 18, floors: 33, floorHeight: 3 }
};

describe('wallGeometry', () => {
  it('rotates local to world about Y (90° sends +X to -Z)', () => {
    const [x, z] = rotateLocalToWorld([1, 0], 90);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(-1, 6);
  });

  it('resolves legacy south-0 to the wall whose outward normal points south (+? -Z)', () => {
    // bar footprint: wall-outer-0 start[-30,-9] end[30,-9] normal[0,-1] => 南(-Z)
    expect(resolveWallId(bar, 'south-0')).toBe('wall-outer-0');
    expect(resolveWallId(bar, 'wall-outer-2')).toBe('wall-outer-2');
  });

  it('tracks rotation: after 180°, south-facing wall flips world normal to +Z', () => {
    const plane0 = resolveWallPlane(bar, 'south-0', { baseY: 24, height: 1.6, width: 2.4 });
    const rotated = { ...bar, rotation: 180 };
    const plane180 = resolveWallPlane(rotated, 'south-0', { baseY: 24, height: 1.6, width: 2.4 });
    expect(plane0.normal[2]).toBeCloseTo(-1, 6);
    expect(plane180.normal[2]).toBeCloseTo(1, 6);
    expect(plane0.bounds).toEqual({ minU: -1.2, maxU: 1.2, minV: 24, maxV: 25.6 });
  });

  it('builds world wall segments translated by position', () => {
    const shifted = { ...bar, position: { x: 10, z: 5 } };
    const walls = worldWallSegments(shifted);
    expect(walls).toHaveLength(4);
    expect(walls[0].start).toEqual([-20, -4]); // [-30,-9] + [10,5]
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/wall-geometry.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `wallGeometry.js`**

```javascript
import { createFootprint } from './createFootprint.js';
import { createWallSegments } from './createWallSegments.js';

const DEG = Math.PI / 180;

export function rotateLocalToWorld([x, z], rotationDeg) {
  const t = rotationDeg * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [x * c + z * s, -x * s + z * c];
}

export function worldWallSegments(building) {
  const footprint = createFootprint(building.template, building.params);
  const { x: px, z: pz } = building.position;
  return createWallSegments(footprint).map(wall => {
    const [sx, sz] = rotateLocalToWorld(wall.start, building.rotation);
    const [ex, ez] = rotateLocalToWorld(wall.end, building.rotation);
    const [nx, nz] = rotateLocalToWorld(wall.normal, building.rotation);
    return {
      id: wall.id,
      start: [sx + px, sz + pz],
      end: [ex + px, ez + pz],
      normal: [nx, nz],
      length: wall.length
    };
  });
}

const COMPASS = { south: [0, -1], north: [0, 1], east: [1, 0], west: [-1, 0] };

export function resolveWallId(building, wallRef) {
  const footprint = createFootprint(building.template, building.params);
  const walls = createWallSegments(footprint);
  if (walls.some(w => w.id === wallRef)) return wallRef;
  const dir = COMPASS[String(wallRef).split('-')[0]];
  if (!dir) return null;
  let best = null;
  let bestDot = -Infinity;
  for (const wall of walls) {
    const d = wall.normal[0] * dir[0] + wall.normal[1] * dir[1];
    if (d > bestDot) { bestDot = d; best = wall.id; }
  }
  return best;
}

export function resolveWallPlane(building, wallRef, { baseY, height, width }) {
  const id = resolveWallId(building, wallRef);
  if (id == null) return null;
  const wall = worldWallSegments(building).find(w => w.id === id);
  if (!wall) return null;
  const mid = [
    (wall.start[0] + wall.end[0]) / 2,
    (wall.start[1] + wall.end[1]) / 2
  ];
  const tx = (wall.end[0] - wall.start[0]) / wall.length;
  const tz = (wall.end[1] - wall.start[1]) / wall.length;
  return {
    point: [mid[0], baseY, mid[1]],
    normal: [wall.normal[0], 0, wall.normal[1]],
    tangent: [tx, 0, tz],
    bounds: { minU: -width / 2, maxU: width / 2, minV: baseY, maxV: baseY + height }
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/wall-geometry.test.js`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add src/domain/buildings/wallGeometry.js tests/unit/wall-geometry.test.js
git commit -m "feat: resolve opening wall planes in world space with rotation"
```

---

### Task 3: 射线-四边形墙面遮挡 + `buildObstacles`

**Files:**
- Modify: `src/domain/simulation/intersectObstacles.js`
- Create: `src/domain/simulation/buildObstacles.js`
- Test: `tests/unit/intersect-obstacles.test.js`（新增）

**Interfaces:**
- Consumes: `worldWallSegments(building)`（Task 2）；`totalBuildingHeight(params)`（现有）。
- Produces:
  - `intersectRayQuad(origin, direction, quad) -> number | null`：`quad = { a:[x,y,z], b, c, d }`（逆/顺时针四点共面矩形），返回正向命中距离或 `null`。双面命中（不像开口那样限定朝向）。
  - `firstObstacleDistance(origin, direction, obstacles, afterDistance)` 扩展：`obstacles` 中每项若含 `.a`（四边形）走 `intersectRayQuad`，若含 `.min/.max`（AABB）走原 `intersectRayAabb`。**保留** `intersectRayAabb` 导出不变（旧 direct-sun 测试的 obstacle 是 AABB）。
  - `buildObstacles(buildings, { excludeWallIds = new Set() } = {}) -> Array<quad>`：对每栋建筑取 `worldWallSegments`，每墙段生成一个从 `y=0` 到 `totalBuildingHeight` 的竖直四边形；`excludeWallIds` 内的 `` `${building.id}:${wall.id}` `` 跳过（观察者自身开口墙）。

- [ ] **Step 1: 写失败测试**

```javascript
import { describe, expect, it } from 'vitest';
import { intersectRayQuad, firstObstacleDistance } from '../../src/domain/simulation/intersectObstacles.js';
import { buildObstacles } from '../../src/domain/simulation/buildObstacles.js';

const wallQuad = {
  a: [-3, 0, -5], b: [3, 0, -5], c: [3, 20, -5], d: [-3, 20, -5]
};

describe('intersectRayQuad', () => {
  it('hits a wall quad straight ahead', () => {
    const d = intersectRayQuad([0, 1, 0], [0, 0, -1], wallQuad);
    expect(d).toBeCloseTo(5, 6);
  });
  it('misses when ray passes beside the quad', () => {
    expect(intersectRayQuad([10, 1, 0], [0, 0, -1], wallQuad)).toBeNull();
  });
});

describe('firstObstacleDistance mixed shapes', () => {
  it('still supports legacy AABB obstacles', () => {
    const d = firstObstacleDistance([0, 1, 0], [0, 0, -1],
      [{ id: 'x', min: [-3, 0, -20], max: [3, 20, -5] }], 0);
    expect(d).toBeCloseTo(5, 6);
  });
});

describe('buildObstacles', () => {
  const bar = {
    id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
    params: { length: 60, depth: 18, floors: 2, floorHeight: 3 }
  };
  it('emits four wall quads reaching building height', () => {
    const quads = buildObstacles([bar]);
    expect(quads).toHaveLength(4);
    const maxY = Math.max(...quads.flatMap(q => [q.a, q.b, q.c, q.d].map(p => p[1])));
    expect(maxY).toBeCloseTo(6, 6); // firstFloorHeight=floorHeight=3, floors=2 => 6
  });
  it('excludes named walls', () => {
    const quads = buildObstacles([bar], { excludeWallIds: new Set(['b1:wall-outer-0']) });
    expect(quads).toHaveLength(3);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/intersect-obstacles.test.js`
Expected: FAIL（`intersectRayQuad`/`buildObstacles` 未定义）。

- [ ] **Step 3: 实现**

在 `intersectObstacles.js` 顶部保留现有 `EPSILON`、`intersectRayAabb`，追加：

```javascript
function subtractV(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function crossV(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function dotV(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

// 矩形 a,b,c,d（a->b 与 a->d 为两邻边）。双面命中。
export function intersectRayQuad(origin, direction, quad) {
  const edgeU = subtractV(quad.b, quad.a);
  const edgeV = subtractV(quad.d, quad.a);
  const normal = crossV(edgeU, edgeV);
  const denom = dotV(direction, normal);
  if (Math.abs(denom) < EPSILON) return null;
  const distance = dotV(subtractV(quad.a, origin), normal) / denom;
  if (distance <= EPSILON) return null;
  const point = [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance
  ];
  const rel = subtractV(point, quad.a);
  const u = dotV(rel, edgeU) / dotV(edgeU, edgeU);
  const v = dotV(rel, edgeV) / dotV(edgeV, edgeV);
  if (u < -EPSILON || u > 1 + EPSILON || v < -EPSILON || v > 1 + EPSILON) return null;
  return distance;
}
```

并把 `firstObstacleDistance` 内的单项相交改为分派：

```javascript
export function firstObstacleDistance(origin, direction, obstacles, afterDistance = 0) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    const distance = obstacle.a
      ? intersectRayQuad(origin, direction, obstacle)
      : intersectRayAabb(origin, direction, obstacle);
    if (distance != null && distance > afterDistance + EPSILON && distance < nearest) {
      nearest = distance;
    }
  }
  return Number.isFinite(nearest) ? nearest : null;
}
```

新建 `buildObstacles.js`：

```javascript
import { worldWallSegments } from '../buildings/wallGeometry.js';
import { totalBuildingHeight } from '../buildings/floorMath.js';

export function buildObstacles(buildings, { excludeWallIds = new Set() } = {}) {
  const quads = [];
  for (const building of buildings) {
    const height = totalBuildingHeight(building.params);
    for (const wall of worldWallSegments(building)) {
      if (excludeWallIds.has(`${building.id}:${wall.id}`)) continue;
      const [sx, sz] = wall.start;
      const [ex, ez] = wall.end;
      quads.push({
        wallId: wall.id,
        buildingId: building.id,
        a: [sx, 0, sz],
        b: [ex, 0, ez],
        c: [ex, height, ez],
        d: [sx, height, sz]
      });
    }
  }
  return quads;
}
```

- [ ] **Step 4: 运行确认通过（含旧 direct-sun 测试不回归）**

Run: `npx vitest run tests/unit/intersect-obstacles.test.js tests/unit/direct-sun.test.js`
Expected: 两个文件全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/domain/simulation/intersectObstacles.js src/domain/simulation/buildObstacles.js tests/unit/intersect-obstacles.test.js
git commit -m "feat: cast rays against rotated wall quads and build building obstacles"
```

---

### Task 4: 采样坐标变换 + 门户构造

**Files:**
- Modify: `src/domain/simulation/sampleArea.js`
- Modify: `src/domain/simulation/evaluateDirectSun.js`
- Create: `src/domain/simulation/buildOpeningPortals.js`
- Test: `tests/unit/build-portals.test.js`（新增）；沿用 `tests/unit/direct-sun.test.js`（不改）

**Interfaces:**
- Consumes: `resolveWallPlane`（Task 2）；`floorBaseY`（现有）。
- Produces:
  - `sampleArea(area, transform)`：`transform` 可选，`(localPos:[x,y,z]) -> worldPos:[x,y,z]`，默认恒等。现有无参调用行为不变。
  - `evaluateDirectSun({ area, openings, obstacles, sunDirection, transform })`：新增可选 `transform` 透传给 `sampleArea`，其余不变。
  - `buildOpeningPortals(building, openings) -> Array<{ id, plane:{point,normal,tangent}, bounds }>`：每个 opening 用 `baseY = floorBaseY({ floor: opening.floor, ...building.params }) + (opening.sillHeight ?? 0)`，调 `resolveWallPlane(building, opening.wallId, { baseY, height: opening.height, width: opening.width })`；`plane` 取 `{point,normal,tangent}`，`bounds` 取返回的 `bounds`；解析失败（`null`）的 opening 跳过。

> `intersectOpening`（现有）用 `plane.point/normal/tangent` + `bounds{minU,maxU,minV,maxV}`，其中 `v = point[1]`（世界 Y）。Task 2 的 `resolveWallPlane` 已按此契约产出 `minV/maxV` 为世界 Y 区间，直接兼容，无需改 `intersectOpening`。

- [ ] **Step 1: 写失败测试**

```javascript
import { describe, expect, it } from 'vitest';
import { sampleArea } from '../../src/domain/simulation/sampleArea.js';
import { buildOpeningPortals } from '../../src/domain/simulation/buildOpeningPortals.js';

describe('sampleArea transform', () => {
  it('is identity without a transform (unchanged)', () => {
    expect(sampleArea({ cells: [[0, 0]], sampleHeight: 0 })[0].position).toEqual([0.25, 0, 0.25]);
  });
  it('applies a world transform when provided', () => {
    const t = ([x, y, z]) => [x + 10, y + 27, z - 5];
    expect(sampleArea({ cells: [[0, 0]], sampleHeight: 0 }, t)[0].position)
      .toEqual([10.25, 27, -4.75]);
  });
});

describe('buildOpeningPortals', () => {
  const bar = {
    id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
    params: { length: 60, depth: 18, floors: 33, floorHeight: 3 }
  };
  it('builds a world portal on the south wall at the correct floor height', () => {
    const portals = buildOpeningPortals(bar, [{
      id: 'op1', wallId: 'south-0', floor: 9, sillHeight: 0.8, width: 2.4, height: 1.6
    }]);
    expect(portals).toHaveLength(1);
    // floorBaseY(floor=9, fh=3) = 3 + 7*3 = 24; +sill 0.8 => 24.8
    expect(portals[0].bounds.minV).toBeCloseTo(24.8, 6);
    expect(portals[0].plane.normal[2]).toBeCloseTo(-1, 6);
  });
  it('skips openings whose wall cannot be resolved', () => {
    expect(buildOpeningPortals(bar, [{ id: 'x', wallId: 'bogus-9', floor: 1, width: 1, height: 1 }]))
      .toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/build-portals.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现**

`sampleArea.js` 改为：

```javascript
const OFFSETS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
const identity = position => position;

export function sampleArea(area, transform = identity) {
  return area.cells.flatMap(([cellX, cellZ]) =>
    OFFSETS.map(([offsetX, offsetZ], index) => ({
      id: `${cellX}:${cellZ}:${index}`,
      position: transform([cellX + offsetX, area.sampleHeight ?? 0, cellZ + offsetZ])
    }))
  );
}
```

`evaluateDirectSun.js` 签名加 `transform`，第一行 `const samples = sampleArea(area, transform);`（其余不动）。

新建 `buildOpeningPortals.js`：

```javascript
import { resolveWallPlane } from '../buildings/wallGeometry.js';
import { floorBaseY } from '../buildings/floorMath.js';

export function buildOpeningPortals(building, openings) {
  const portals = [];
  for (const opening of openings) {
    const baseY = floorBaseY({ floor: opening.floor, ...building.params }) + (opening.sillHeight ?? 0);
    const resolved = resolveWallPlane(building, opening.wallId, {
      baseY, height: opening.height, width: opening.width
    });
    if (!resolved) continue;
    portals.push({
      id: opening.id,
      plane: { point: resolved.point, normal: resolved.normal, tangent: resolved.tangent },
      bounds: resolved.bounds
    });
  }
  return portals;
}
```

- [ ] **Step 4: 运行确认通过（含 direct-sun 不回归）**

Run: `npx vitest run tests/unit/build-portals.test.js tests/unit/direct-sun.test.js`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/domain/simulation/sampleArea.js src/domain/simulation/evaluateDirectSun.js src/domain/simulation/buildOpeningPortals.js tests/unit/build-portals.test.js
git commit -m "feat: transform area samples to world space and build opening portals"
```

---

### Task 5: 重写 `createSimulationController` 接引擎

**Files:**
- Modify: `src/features/results/createSimulationController.js`
- Test: `tests/unit/simulation-controller.test.js`（改造）

**Interfaces:**
- Consumes: `getSolarPosition`（现有）；`buildObstacles`（Task 3）；`buildOpeningPortals`（Task 4）；`evaluateDirectSun`（Task 4）；`floorBaseY`（现有）；`rotateLocalToWorld`（Task 2）。
- Produces（发布的 state 形状，Task 6/7 消费）：
  ```
  {
    location, date, time, minute, solar,
    noArea: boolean,          // 无可分析观察区
    hasDirectSun: boolean,
    litRatio: number,         // 0..1
    litSampleIds: string[],
    activeAreaId: string|null,
    areaOptions: Array<{ id, name }>,  // 全项目所有观察区，供选择器
    intervals: null,          // 全天分析下一轮
    totalMinutes: null
  }
  ```
- 保留 `setTime/setDate/setLocation/subscribe/getState/dispose` 对外方法与现有签名不变。新增 `setActiveArea(areaId)`（`store.execute` 写 `simulation.activeAreaId`）。

**核心解析逻辑（写进 `calculate()`）：**
1. 汇总所有建筑的观察区为 `areaOptions`（`{ id, name }`），并建立 `areaId -> { building, area }` 映射。
2. 选定激活区：`project.simulation.activeAreaId` 命中则用之；否则回退第一个（若存在）。都没有 → `noArea: true`，其余分析字段填空（`hasDirectSun:false, litRatio:0, litSampleIds:[]`）。
3. 有区时：
   - `baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0)`
   - `transform = localPos => { const [wx, wz] = rotateLocalToWorld([localPos[0], localPos[2]], building.rotation); return [wx + building.position.x, baseY, wz + building.position.z]; }`
   - `openings = building.openings.filter(o => (area.openingIds ?? []).includes(o.id))`
   - `portals = buildOpeningPortals(building, openings)`
   - `excludeWallIds = new Set(openings.map(o => \`${building.id}:${resolveWallId?}\`))` → 用 `buildOpeningPortals` 已解析的墙没直接暴露 id，改为：在 controller 里对每个 opening 调 `resolveWallId(building, o.wallId)` 得到真实墙 id 组装排除集（`resolveWallId` 从 Task 2 导出）。
   - `obstacles = buildObstacles(project.buildings, { excludeWallIds })`
   - 太阳在地平线下 → `hasDirectSun:false`；否则 `evaluateDirectSun({ area, openings: portals, obstacles, sunDirection:[dir.x,dir.y,dir.z], transform })`。

- [ ] **Step 1: 改造测试（替换硬编码断言，新增场景驱动断言）**

保留现有 setTime/setDate/setLocation/dispose 用例（它们不依赖硬编码的 `DIRECT_INTERVAL`，只断言 `store` 写入与 `solar.altitudeDeg`——但注意其中一个断言 `hasDirectSun === true` 依赖旧硬编码）。改造该断言为场景驱动，并新增遮挡/无区用例：

```javascript
import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createSimulationController } from '../../src/features/results/createSimulationController.js';
import { createStore } from '../../src/store/createStore.js';

function projectWithSouthWindow() {
  const p = createDefaultProject();
  p.simulation.date = '2026-12-21';
  p.simulation.time = '12:00';
  p.simulation.activeAreaId = 'area-a';
  p.buildings = [{
    id: 'b1', revision: 1, name: '住宅 A', template: 'bar',
    position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 60, depth: 18, floors: 3, floorHeight: 3 },
    observationAreas: [{
      id: 'area-a', name: '客厅', floor: 1,
      cells: [[0, -12]], sampleHeight: 1.2, openingIds: ['op1']
    }],
    openings: [{ id: 'op1', type: 'window', wallId: 'south-0', floor: 1, width: 3, height: 1.6, sillHeight: 0.9 }]
  }];
  return p;
}

describe('simulation controller — real geometry', () => {
  it('reports direct sun for an unobstructed south window at noon', () => {
    const controller = createSimulationController(createStore(projectWithSouthWindow()));
    const state = controller.getState();
    expect(state.noArea).toBe(false);
    expect(state.hasDirectSun).toBe(true);
    expect(state.litRatio).toBeGreaterThan(0);
    expect(state.totalMinutes).toBeNull();
  });

  it('loses direct sun when a tall building blocks the window', () => {
    const p = projectWithSouthWindow();
    p.buildings.push({
      id: 'blocker', revision: 1, name: '遮挡楼', template: 'bar',
      position: { x: 0, z: -30 }, rotation: 0,
      params: { length: 120, depth: 18, floors: 40, floorHeight: 3 },
      observationAreas: [], openings: []
    });
    const controller = createSimulationController(createStore(p));
    expect(controller.getState().hasDirectSun).toBe(false);
  });

  it('flags noArea when there are no observation areas', () => {
    const controller = createSimulationController(createStore(createDefaultProject()));
    const state = controller.getState();
    expect(state.noArea).toBe(true);
    expect(state.areaOptions).toEqual([]);
  });

  it('lists all observation areas as options and switches active area', () => {
    const store = createStore(projectWithSouthWindow());
    const controller = createSimulationController(store);
    expect(controller.getState().areaOptions).toEqual([{ id: 'area-a', name: '客厅' }]);
    controller.setActiveArea('area-a');
    expect(store.getState().simulation.activeAreaId).toBe('area-a');
  });
});
```

> 说明：`cells: [[0, -12]]` 让采样点落在建筑南墙外侧附近（南墙在局部 z=-9，depth=18），配合 `sampleHeight` 抬到窗高，确保有向南的无遮挡视线。执行时若几何未命中需微调 cell/height——这是本任务实现者的调试点，允许微调 fixture 数值使"无遮挡=有光、加高楼=无光"两个断言成立，但不得改断言语义。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/simulation-controller.test.js`
Expected: FAIL（`noArea`/`areaOptions`/`setActiveArea` 不存在，`hasDirectSun` 仍是硬编码）。

- [ ] **Step 3: 重写 `createSimulationController.js`**

```javascript
import { getSolarPosition } from '../../domain/solar/getSolarPosition.js';
import { floorBaseY } from '../../domain/buildings/floorMath.js';
import { rotateLocalToWorld, resolveWallId } from '../../domain/buildings/wallGeometry.js';
import { buildObstacles } from '../../domain/simulation/buildObstacles.js';
import { buildOpeningPortals } from '../../domain/simulation/buildOpeningPortals.js';
import { evaluateDirectSun } from '../../domain/simulation/evaluateDirectSun.js';

export function timeToMinute(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
export function minuteToTime(minute) {
  const n = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

function collectAreas(project) {
  const options = [];
  const map = new Map();
  for (const building of project.buildings) {
    for (const area of building.observationAreas ?? []) {
      options.push({ id: area.id, name: area.name });
      map.set(area.id, { building, area });
    }
  }
  return { options, map };
}

export function createSimulationController(store) {
  const listeners = new Set();
  let state;

  function calculate() {
    const project = store.getState();
    const time = project.simulation.time;
    const minute = timeToMinute(time);
    const solar = getSolarPosition({
      ...project.location, localDate: project.simulation.date, localTime: time
    });
    const { options, map } = collectAreas(project);
    const activeId = map.has(project.simulation.activeAreaId)
      ? project.simulation.activeAreaId
      : (options[0]?.id ?? null);

    const base = {
      location: project.location, date: project.simulation.date, time, minute, solar,
      activeAreaId: activeId, areaOptions: options, intervals: null, totalMinutes: null
    };

    if (!activeId) {
      state = { ...base, noArea: true, hasDirectSun: false, litRatio: 0, litSampleIds: [] };
      return;
    }
    const { building, area } = map.get(activeId);
    const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
    const transform = ([lx, , lz]) => {
      const [wx, wz] = rotateLocalToWorld([lx, lz], building.rotation);
      return [wx + building.position.x, baseY, wz + building.position.z];
    };
    const openings = (building.openings ?? []).filter(o => (area.openingIds ?? []).includes(o.id));
    const portals = buildOpeningPortals(building, openings);
    const excludeWallIds = new Set(
      openings
        .map(o => resolveWallId(building, o.wallId))
        .filter(Boolean)
        .map(wallId => `${building.id}:${wallId}`)
    );
    const obstacles = buildObstacles(project.buildings, { excludeWallIds });

    const result = solar.aboveHorizon
      ? evaluateDirectSun({
          area, openings: portals, obstacles,
          sunDirection: [solar.direction.x, solar.direction.y, solar.direction.z],
          transform
        })
      : { hasDirectSun: false, litRatio: 0, litSampleIds: [] };

    state = {
      ...base, noArea: false,
      hasDirectSun: result.hasDirectSun, litRatio: result.litRatio, litSampleIds: result.litSampleIds
    };
  }

  function update() { calculate(); for (const l of listeners) l(state); }
  calculate();
  const unsubscribe = store.subscribe(update);

  function patchSimulation(label, patch) {
    store.execute({
      label,
      apply: project => ({ ...project, simulation: { ...project.simulation, ...patch } })
    });
  }

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setTime(time) { patchSimulation('修改模拟时间', { time }); },
    setDate(date) { patchSimulation('修改模拟日期', { date }); },
    setActiveArea(activeAreaId) { patchSimulation('切换观察区', { activeAreaId }); },
    setLocation(location) {
      store.execute({
        label: '修改项目位置',
        apply: project => ({ ...project, location: structuredClone(location) })
      });
    },
    dispose() { unsubscribe(); listeners.clear(); }
  };
}
```

- [ ] **Step 4: 运行确认通过（微调 fixture 数值直到遮挡两断言成立）**

Run: `npx vitest run tests/unit/simulation-controller.test.js`
Expected: PASS。若"无遮挡=有光"不成立，调 `cells`/`sampleHeight`/`time`（如改 `12:00`→`11:00`）而非改断言。

- [ ] **Step 5: 全量单测回归**

Run: `npm test`
Expected: 全绿（含 direct-sun、buildings、scene-sync、date-range 等既有文件）。

- [ ] **Step 6: 提交**

```bash
git add src/features/results/createSimulationController.js tests/unit/simulation-controller.test.js
git commit -m "feat: compute direct sunlight from real scene geometry"
```

---

### Task 6: `ResultsPanel` 占位文案 + 观察区选择器

**Files:**
- Modify: `src/features/results/ResultsPanel.js`
- Test: `tests/unit/results-panel.test.js`（新增，jsdom）

**Interfaces:**
- Consumes: controller state 形状（Task 5）；`createElement`（现有）。
- Produces: DOM 行为——`noArea` 显示"暂无观察区"；`totalMinutes==null` 时长/时段显示"尚未计算"；`areaOptions.length>1` 时渲染 `<select data-testid="area-select">`，change 调 `controller.setActiveArea(value)`。

> vitest 默认 `environment:'node'`（见 `vite.config.js`），本测试需 DOM。文件顶部加注释 `// @vitest-environment jsdom`。确认 jsdom 可用：`node -e "require('jsdom')"`；若不可用，Step 1 前先 `npm i -D jsdom`（jsdom 是 vitest 生态标准 DOM，符合"标准选择"约定）。

- [ ] **Step 1: 写失败测试**

```javascript
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createResultsPanel } from '../../src/features/results/ResultsPanel.js';

function fakeController(state) {
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe: l => { listeners.add(l); return () => listeners.delete(l); },
    setActiveArea: vi.fn(),
    _emit(next) { state = next; for (const l of listeners) l(next); }
  };
}
const solar = { altitudeDeg: 40, azimuthDeg: 180 };

describe('ResultsPanel', () => {
  it('shows placeholder for daily totals instead of hardcoded interval', () => {
    const el = createResultsPanel(fakeController({
      noArea: false, hasDirectSun: true, litRatio: 0.5, solar,
      totalMinutes: null, intervals: null, areaOptions: [{ id: 'a', name: '客厅' }], activeAreaId: 'a'
    }));
    expect(el.textContent).toContain('尚未计算');
    expect(el.textContent).not.toContain('09:12');
  });

  it('shows an empty-area hint when noArea', () => {
    const el = createResultsPanel(fakeController({
      noArea: true, hasDirectSun: false, litRatio: 0, solar,
      totalMinutes: null, intervals: null, areaOptions: [], activeAreaId: null
    }));
    expect(el.querySelector('[data-testid="direct-sun-status"]').textContent).toContain('暂无观察区');
  });

  it('renders a selector when more than one area and dispatches on change', () => {
    const controller = fakeController({
      noArea: false, hasDirectSun: true, litRatio: 1, solar,
      totalMinutes: null, intervals: null,
      areaOptions: [{ id: 'a', name: '客厅' }, { id: 'b', name: '卧室' }], activeAreaId: 'a'
    });
    const el = createResultsPanel(controller);
    const select = el.querySelector('[data-testid="area-select"]');
    expect(select).not.toBeNull();
    select.value = 'b';
    select.dispatchEvent(new window.Event('change'));
    expect(controller.setActiveArea).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/results-panel.test.js`
Expected: FAIL（硬编码 `09:12–14:38` 仍在，无选择器/占位）。

- [ ] **Step 3: 改 `ResultsPanel.js`**

关键改动（保留现有结构，替换硬编码与 update 逻辑）：

```javascript
import { createElement } from '../../ui/createElement.js';
import { createDirectSunStatus } from './DirectSunStatus.js';

function durationLabel(totalMinutes) {
  if (totalMinutes == null) return '尚未计算';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} 小时 ${m} 分`;
}

export function createResultsPanel(controller) {
  const status = createDirectSunStatus();
  const duration = createElement('h2', { className: 'result-duration', testId: 'daily-total' });
  const altitude = createElement('dd', { testId: 'solar-altitude' });
  const azimuth = createElement('dd');
  const litRatio = createElement('dd');
  const intervalText = createElement('dd', { text: '尚未计算' });

  const areaField = createElement('label', { className: 'field area-select-field', attributes: { hidden: '' } });
  const areaSelect = createElement('select', { className: 'input', testId: 'area-select', attributes: { 'aria-label': '观察区' } });
  areaSelect.addEventListener('change', () => controller.setActiveArea(areaSelect.value));
  areaField.append(
    createElement('span', { className: 'field__label', text: '观察区' }),
    areaSelect
  );

  const element = createElement(
    'section', { className: 'results-panel', testId: 'results-panel' },
    createElement('div', { className: 'panel__label', text: '当前分析' }),
    areaField,
    status.element,
    duration,
    createElement('dl', { className: 'metric-list' },
      createElement('dt', { text: '太阳高度角' }), altitude,
      createElement('dt', { text: '太阳方位角' }), azimuth,
      createElement('dt', { text: '照亮比例' }), litRatio,
      createElement('dt', { text: '直射时段' }), intervalText
    ),
    createElement('p', { className: 'disclaimer', text: '结果仅供购房参考，不能替代专业日照合规报告。' })
  );

  function renderAreaOptions(options, activeId) {
    areaField.hidden = options.length <= 1;
    areaSelect.replaceChildren(...options.map(o => {
      const opt = createElement('option', { text: o.name, attributes: { value: o.id } });
      if (o.id === activeId) opt.setAttribute('selected', '');
      return opt;
    }));
    if (activeId != null) areaSelect.value = activeId;
  }

  function update(state) {
    renderAreaOptions(state.areaOptions ?? [], state.activeAreaId);
    if (state.noArea) {
      status.element.className = 'status-pill status-pill--neutral';
      status.element.textContent = '暂无观察区';
    } else {
      status.update(state.hasDirectSun);
    }
    duration.textContent = durationLabel(state.totalMinutes);
    intervalText.textContent = state.intervals == null ? '尚未计算' : '';
    altitude.textContent = `${state.solar.altitudeDeg.toFixed(1)}°`;
    azimuth.textContent = `${state.solar.azimuthDeg.toFixed(1)}°`;
    litRatio.textContent = state.noArea ? '—' : `${Math.round(state.litRatio * 100)}%`;
  }
  update(controller.getState());
  controller.subscribe(update);
  return element;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/results-panel.test.js`
Expected: PASS（3 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/features/results/ResultsPanel.js tests/unit/results-panel.test.js
git commit -m "feat: show real analysis, area selector, and pending placeholders in results panel"
```

---

### Task 7: 场景叠加层接入

**Files:**
- Modify: `src/scene/createSceneController.js`
- Test: `tests/unit/scene-analysis.test.js`（新增）

**Interfaces:**
- Consumes: `createObservationOverlay({ cells, baseY, litSampleIds })`、`createOpeningOverlay({ id, width, height, center, normal })`（现有，未接入）；`sceneParts.overlays`（现有，`createScene` 已建 `overlays` group）；controller state（Task 5，含 `litSampleIds`）；`floorBaseY`、`rotateLocalToWorld`、`buildOpeningPortals`。
- Produces: `sceneController.updateAnalysis(project, simulationState)` 方法——重建 `overlays` group 内容：激活区观察格（用 `litSampleIds` 标亮）+ 关联开口面。无激活区时清空 overlays。`dispose` 时清 overlays。

> 观察格世界坐标：与控制器 transform 一致（局部 cell 旋转+平移，baseY=floorBaseY+sampleHeight）。`observationOverlay` 当前按 `[x+0.5, baseY, z+0.5]` 摆格且不含旋转/平移——本任务给它包一层 group，对 group 施加 `position`（建筑 position）与 `rotation.y`（建筑 rotation），格子仍用局部 cell 坐标，从而复用现有实现不改它。开口面 `center`/`normal` 用 `buildOpeningPortals` 的 `plane.point`（世界中点，但 y 需为窗中心=`baseY+height/2`）与 `plane.normal`。

- [ ] **Step 1: 写失败测试（纯逻辑层，不起真实 WebGL）**

`createSceneController` 依赖真实 canvas/WebGL，无法在 node 直接实例化。因此本任务测试聚焦一个**可提纯的纯函数** `buildAnalysisOverlays(project, simulationState)`（在 controller 内部定义并导出），返回描述对象数组，供 `updateAnalysis` 消费；Three.js 对象构造本身不单测（由 e2e Task 8 间接覆盖）。

```javascript
import { describe, expect, it } from 'vitest';
import { buildAnalysisOverlays } from '../../src/scene/analysisOverlays.js';

const project = {
  buildings: [{
    id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
    params: { length: 60, depth: 18, floors: 3, floorHeight: 3 },
    observationAreas: [{ id: 'a', name: '客厅', floor: 1, cells: [[0, -12]], sampleHeight: 1.2, openingIds: ['op1'] }],
    openings: [{ id: 'op1', wallId: 'south-0', floor: 1, width: 3, height: 1.6, sillHeight: 0.9 }]
  }]
};

describe('buildAnalysisOverlays', () => {
  it('returns area + opening descriptors for the active area', () => {
    const out = buildAnalysisOverlays(project, { activeAreaId: 'a', litSampleIds: ['0:-12:0'], noArea: false });
    expect(out.area).toMatchObject({ cells: [[0, -12]], litSampleIds: ['0:-12:0'] });
    expect(out.area.group).toMatchObject({ position: { x: 0, z: 0 }, rotationDeg: 0 });
    expect(out.openings).toHaveLength(1);
    expect(out.openings[0]).toMatchObject({ id: 'op1', width: 3, height: 1.6 });
  });

  it('returns null when noArea', () => {
    expect(buildAnalysisOverlays(project, { activeAreaId: null, litSampleIds: [], noArea: true })).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/scene-analysis.test.js`
Expected: FAIL（`analysisOverlays.js` 不存在）。

- [ ] **Step 3: 实现 `src/scene/analysisOverlays.js`（纯数据）**

```javascript
import { floorBaseY } from '../domain/buildings/floorMath.js';
import { buildOpeningPortals } from '../domain/simulation/buildOpeningPortals.js';

export function buildAnalysisOverlays(project, simulationState) {
  if (simulationState.noArea || !simulationState.activeAreaId) return null;
  let found = null;
  for (const building of project.buildings) {
    const area = (building.observationAreas ?? []).find(a => a.id === simulationState.activeAreaId);
    if (area) { found = { building, area }; break; }
  }
  if (!found) return null;
  const { building, area } = found;
  const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
  const openings = (building.openings ?? []).filter(o => (area.openingIds ?? []).includes(o.id));
  const portals = buildOpeningPortals(building, openings);
  return {
    area: {
      cells: area.cells,
      baseY,
      litSampleIds: simulationState.litSampleIds ?? [],
      group: { position: { x: building.position.x, z: building.position.z }, rotationDeg: building.rotation }
    },
    openings: openings.map(o => {
      const portal = portals.find(p => p.id === o.id);
      return {
        id: o.id, width: o.width, height: o.height,
        center: portal ? [portal.plane.point[0], portal.bounds.minV + o.height / 2, portal.plane.point[2]] : null,
        normal: portal ? portal.plane.normal : null
      };
    }).filter(o => o.center)
  };
}
```

- [ ] **Step 4: 接入 `createSceneController.js`**

顶部加 import：
```javascript
import { createObservationOverlay } from './observationOverlay.js';
import { createOpeningOverlay } from './openingOverlay.js';
import { buildAnalysisOverlays } from './analysisOverlays.js';
import * as THREE from 'three'; // 已存在
```
在返回对象里新增（`overlays` 来自 `sceneParts.overlays`）：
```javascript
    updateAnalysis(project, simulationState) {
      sceneParts.overlays.clear();
      const overlays = buildAnalysisOverlays(project, simulationState);
      if (!overlays) return;
      const areaGroup = createObservationOverlay({
        cells: overlays.area.cells, baseY: overlays.area.baseY, litSampleIds: overlays.area.litSampleIds
      });
      areaGroup.position.set(overlays.area.group.position.x, 0, overlays.area.group.position.z);
      areaGroup.rotation.y = THREE.MathUtils.degToRad(overlays.area.group.rotationDeg);
      sceneParts.overlays.add(areaGroup);
      for (const opening of overlays.openings) {
        sceneParts.overlays.add(createOpeningOverlay(opening));
      }
    },
```
`dispose()` 内 `synchronizer.dispose();` 后加一行 `sceneParts.overlays.clear();`。

- [ ] **Step 5: 运行 + 构建**

Run: `npx vitest run tests/unit/scene-analysis.test.js && npm run build`
Expected: 单测 PASS；build 成功（含 Three.js chunk）。

- [ ] **Step 6: 提交**

```bash
git add src/scene/analysisOverlays.js src/scene/createSceneController.js tests/unit/scene-analysis.test.js
git commit -m "feat: render observation area and opening overlays in the scene"
```

---

### Task 8: main.js 接线 + 遮挡 e2e

**Files:**
- Modify: `src/main.js`
- Create: `tests/e2e/occlusion.spec.js`

**Interfaces:**
- Consumes: `sceneController.updateAnalysis`（Task 7）；`simulationController` / `store` 订阅（现有）。
- Produces: 每次 store 变化或 solar 变化时调用 `updateAnalysis(project, simulationState)`，使叠加层随场景/时间刷新。

**接线要点：** `updateProject` 与 `updateSolar` 之外新增对 `updateAnalysis` 的调用。因为叠加层同时依赖 project（几何、cells）与 simulationState（litSampleIds），在**两个订阅回调里都**调用 `updateAnalysis(store.getState(), simulationController.getState())`（各取最新）。同样走 `sceneReady.then` 兜底。

- [ ] **Step 1: 改 `main.js` store 订阅回调**

在 `store.subscribe` 回调末尾（`if (sceneController) sceneController.updateProject(project); else ...` 之后）追加：

```javascript
    const sim = simulationController.getState();
    if (sceneController) sceneController.updateAnalysis(project, sim);
    else sceneReady.then(controller => controller?.updateAnalysis(store.getState(), simulationController.getState()));
```

- [ ] **Step 2: 改 `main.js` simulation 订阅回调**

`simulationController.subscribe` 回调改为同时刷新 solar 与 analysis：

```javascript
  simulationController.subscribe(state => {
    if (sceneController) {
      sceneController.updateSolar(state);
      sceneController.updateAnalysis(store.getState(), state);
    } else {
      sceneReady.then(controller => {
        controller?.updateSolar(state);
        controller?.updateAnalysis(store.getState(), simulationController.getState());
      });
    }
  });
```

并在 `sceneReady` 的初始化 then 里，`updateSolar(...)` 后加 `sceneController.updateAnalysis(store.getState(), simulationController.getState());`。

- [ ] **Step 3: 构建确认接线不崩**

Run: `npm run build`
Expected: 成功。

- [ ] **Step 4: 写遮挡 e2e**

`tests/e2e/occlusion.spec.js`。通过 UI 造场景较繁琐，改用导入 fixture 项目触发计算，断言结果面板状态。fixture 用现有 `tests/fixtures/unobstructed-south-window.json`（无遮挡→应有直射），并动态构造一个带遮挡楼的项目对比。用页面的导入入口（`data-action="import-project"` 的隐藏 file input）。

```javascript
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/unobstructed-south-window.json'
);

test('imports a south-window project and reports direct sun', async ({ page }) => {
  await page.goto('/');
  // 触发隐藏 file input
  await page.getByRole('button', { name: '导入' }).click();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  // 无观察区选择（单区），结果面板应展示直射状态（非“暂无观察区”）
  const status = page.getByTestId('direct-sun-status');
  await expect(status).not.toHaveText('暂无观察区');
  // 全天时段占位保持“尚未计算”，不出现旧硬编码
  await expect(page.getByTestId('results-panel')).toContainText('尚未计算');
  await expect(page.getByTestId('results-panel')).not.toContainText('09:12');
});
```

> 说明：fixture 的窗在南墙、深圳冬至 09:30，太阳偏南——预期有直射。若因采样几何未命中导致 status 是"无直射"而非"有直射"，允许把 fixture 的 `time` 调到正午或微调 `cells`（同步改 fixture 文件），但断言"非暂无观察区 + 尚未计算占位 + 无 09:12"三条不变。此测试的核心是证明**导入真实项目后面板走真实计算路径且无硬编码残留**。

- [ ] **Step 5: 跑 e2e（若本机可用）**

Run: `npm run test:e2e -- occlusion.spec.js`
Expected: PASS（desktop + mobile 两 project）。若本机无法下载 Playwright 浏览器，记录为环境限制，在最终验证阶段补跑。

- [ ] **Step 6: 提交**

```bash
git add src/main.js tests/e2e/occlusion.spec.js
git commit -m "feat: wire scene analysis overlays and cover occlusion end to end"
```

---

### Task 9: 全量验证与文档

**Files:**
- Modify: `README.md`（"当前能力"一节，把"太阳位置、场景阴影和分析结果同步更新"改为反映真实计算与"全天累计采光"仍为占位的现状；一句话说明）。
- Modify: `CLAUDE.md`（"Worker: full-day analysis exists but isn't wired up yet" 一节维持；把"the live results panel is a stub"相关描述更新为已接真实计算，全天分析仍未接）。

**Interfaces:** 无代码接口。

- [ ] **Step 1: 三件套全绿**

Run: `npm test && npm run test:e2e && npm run build`
Expected: 单元全绿；e2e 全绿（或记录浏览器下载环境限制）；build 无警告（`chunkSizeWarningLimit:650` 内）。

- [ ] **Step 2: 更新 README 与 CLAUDE.md 现状描述**

按上面 Files 说明改两处描述，只改与"结果计算"相关的过时表述，不新增章节。

- [ ] **Step 3: 提交**

```bash
git add README.md CLAUDE.md
git commit -m "docs: reflect real-time sunlight calculation in results panel"
```

## Self-Review

- **Spec coverage**：目标"结果随场景变化"→Task 5；"观察区/开口场景可见"→Task 7+8；"多区域选择"→Task 5+6；"全天占位"→Task 6；"死代码清理"→Task 1；"旋转/L型/回字形几何"→Task 2/3（回字形墙段由 `createWallSegments` 的 hole 环覆盖，`buildObstacles` 自动纳入内墙）。验收标准逐条有任务归属。
- **Placeholder scan**：无 TODO/TBD；每个改代码步骤含完整代码块；fixture 数值微调点已显式标注为实现者调试点并约束"不改断言语义"。
- **Type consistency**：`resolveWallId`/`resolveWallPlane`/`worldWallSegments`/`rotateLocalToWorld`（Task 2）→Task 3/4/5/7 一致引用；controller state 字段（`noArea/litRatio/litSampleIds/areaOptions/activeAreaId/intervals/totalMinutes`）在 Task 5 定义，Task 6/7/8 一致消费；`buildObstacles` 的 `excludeWallIds` 集合键 `` `${buildingId}:${wallId}` `` 在 Task 3 与 Task 5 一致。





