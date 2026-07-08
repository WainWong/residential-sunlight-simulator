# 俯视楼层观察区编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把观察区编辑从右栏抽象 8×5 网格控件，改成"进入 areas 模式→主视图俯视只显示选中楼层→在楼层平面上拖连续矩形圈定观察区"，矩形碰到外墙处自动开孔，直接产出真实日照。

**Architecture:** 采用"实心楼 + 挖空腔"模型（一级保真）。观察区数据从 `cells`（整数格）改为 `rects`（浮点米矩形）。新增域函数 `rectsToSamplePoints`（矩形→采样点）与 `deriveAperturesFromArea`（矩形∩外墙→世界坐标采光口 portal + 开孔墙 id），喂给**不变**的 `evaluateDirectSun`/`buildObstacles`/`intersectOpening`。场景侧新增"楼层聚焦"(俯视+可见性隔离)与"拖拽画矩形"，UI 用悬浮工具条取代旧网格控件。

**Tech Stack:** 原生 ES 模块、Three.js 0.185、Vitest（node + 单文件 jsdom pragma）、Playwright。`src/domain/` 保持无 DOM/Three.js。

## Global Constraints

- Node >= 22.12；不新增运行时/产品依赖（jsdom 为已有 devDependency，可用）。
- `src/domain/` 内代码不 import DOM/Three.js；旋转用 `rotateLocalToWorld`（现有）与 `Math`。
- 不改 `evaluateDirectSun`、`intersectOpening`、`buildObstacles` 的核心；开口来源改为自动派生。
- 采样精度是内部参数（`SAMPLE_SPACING = 1` 米），不暴露给用户；"被照亮比例 = 被照采样点 / 总采样点"语义不变。
- 自动开孔严格规则：观察区矩形跨过外墙线、或矩形边与墙线完全重合，才在该段开孔（无模糊阈值）。
- 新交互支持鼠标、键盘、触屏；工具条按钮/输入为原生元素。
- 每任务结束 `npm test` 全绿再提交；交付前 `npm test` + `npm run build` 通过，e2e 至少 `--list` 解析。
- TDD：先写失败测试→确认 RED→最小实现→确认 GREEN→提交。

## 数据模型（全任务共享）

观察区 `area`：
```
{ id, name, floor, rects: [{ x0, z0, x1, z1 }], sampleHeight }   // 米，楼层局部坐标；不再有 cells / openingIds
```
矩形角坐标为浮点，`x0/x1`、`z0/z1` 不要求有序（用到时取 min/max）。

## File Structure

- 新增 `src/domain/simulation/rectsToSamplePoints.js` — 矩形→局部采样点（纯）。
- 改 `src/domain/simulation/sampleArea.js` — 采样点来源改 `area.rects`。
- 新增 `src/domain/simulation/deriveApertures.js` — `deriveAperturesFromArea` (矩形∩外墙→世界 portal + 开孔墙 id)。
- 改 `src/domain/project/migrateProject.js` — `cells`→`rects:[]` 丢弃迁移。
- 改 `src/features/results/createSimulationController.js` — areas 计算链改用 rects 采样 + 自动开孔。
- 改 `src/scene/observationOverlay.js` — 画矩形高亮而非小方格。
- 新增 `src/scene/floorFocus.js` — 楼层聚焦（俯视相机目标、可见性隔离决策、footprint 楼板 + 参考线）。
- 新增 `src/scene/areaDrag.js` — 俯视拖拽画矩形（射线→楼层平面米坐标、矩形规整、加/减）。
- 新增 `src/features/areas/createAreaFloorTool.js` — 悬浮工具条。
- 删 `src/features/areas/AreaPainter.js`、`AreaInspector.js`、`ObservationAreaSection.js`。
- 改 `src/features/buildings/BuildingInspector.js` — areas 分支挂载新工具条。
- 改 `src/scene/createSceneController.js` + `src/main.js` — areas 模式接入楼层聚焦与拖拽。

---

### Task 1: rectsToSamplePoints（矩形→采样点）

**Files:**
- Create: `src/domain/simulation/rectsToSamplePoints.js`
- Test: `tests/unit/rects-to-samples.test.js`

**Interfaces:**
- Produces: `rectsToSamplePoints(rects, spacing = 1, sampleHeight = 0) -> Array<{ id, position: [x, y, z] }>`：
  - 对每个 `{x0,z0,x1,z1}`（角坐标无序），取 `xMin=min(x0,x1)` 等；在 `[xMin,xMax]×[zMin,zMax]` 内按 `spacing` 步长铺采样点，点落在每个 `spacing×spacing` 子格中心（`xMin + (i+0.5)*spacing`）。
  - `position = [x, sampleHeight, z]`（局部坐标；世界化由调用方的 transform 完成，和现有一致）。
  - `id = \`${gx}:${gz}\``，其中 `gx = round(x/spacing)`、`gz = round(z/spacing)`——跨矩形按格去重（同一格心只保留一个）。
  - 空 `rects` 或退化矩形（宽或高 < spacing 的一半致无格心）→ 返回 `[]`。

- [ ] **Step 1: 写失败测试**

```javascript
import { describe, expect, it } from 'vitest';
import { rectsToSamplePoints } from '../../src/domain/simulation/rectsToSamplePoints.js';

describe('rectsToSamplePoints', () => {
  it('places one centre per 1m cell over a 2x1 rect', () => {
    const pts = rectsToSamplePoints([{ x0: 0, z0: 0, x1: 2, z1: 1 }], 1, 0);
    expect(pts.map(p => p.position)).toEqual([[0.5, 0, 0.5], [1.5, 0, 0.5]]);
  });

  it('handles unordered corners', () => {
    const pts = rectsToSamplePoints([{ x0: 2, z0: 1, x1: 0, z1: 0 }], 1, 0);
    expect(pts.map(p => p.position)).toEqual([[0.5, 0, 0.5], [1.5, 0, 0.5]]);
  });

  it('applies sampleHeight to y', () => {
    const pts = rectsToSamplePoints([{ x0: 0, z0: 0, x1: 1, z1: 1 }], 1, 1.2);
    expect(pts[0].position).toEqual([0.5, 1.2, 0.5]);
  });

  it('dedupes overlapping rects by grid cell', () => {
    const pts = rectsToSamplePoints(
      [{ x0: 0, z0: 0, x1: 2, z1: 1 }, { x0: 1, z0: 0, x1: 3, z1: 1 }], 1, 0
    );
    expect(pts.map(p => p.position)).toEqual([[0.5, 0, 0.5], [1.5, 0, 0.5], [2.5, 0, 0.5]]);
  });

  it('returns [] for empty rects', () => {
    expect(rectsToSamplePoints([], 1, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/rects-to-samples.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

```javascript
export function rectsToSamplePoints(rects, spacing = 1, sampleHeight = 0) {
  const byCell = new Map();
  for (const rect of rects ?? []) {
    const xMin = Math.min(rect.x0, rect.x1);
    const xMax = Math.max(rect.x0, rect.x1);
    const zMin = Math.min(rect.z0, rect.z1);
    const zMax = Math.max(rect.z0, rect.z1);
    for (let x = xMin + spacing / 2; x < xMax; x += spacing) {
      for (let z = zMin + spacing / 2; z < zMax; z += spacing) {
        const gx = Math.round(x / spacing);
        const gz = Math.round(z / spacing);
        const id = `${gx}:${gz}`;
        if (!byCell.has(id)) byCell.set(id, { id, position: [x, sampleHeight, z] });
      }
    }
  }
  return [...byCell.values()];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/rects-to-samples.test.js`
Expected: PASS（5 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/domain/simulation/rectsToSamplePoints.js tests/unit/rects-to-samples.test.js
git commit -m "feat: sample observation-area rectangles into world sample points"
```

---

### Task 2: sampleArea 改用 rects

**Files:**
- Modify: `src/domain/simulation/sampleArea.js`
- Test: `tests/unit/direct-sun.test.js`（改 fixture + 断言）

**Interfaces:**
- Consumes: `rectsToSamplePoints`（Task 1）。
- Produces: `sampleArea(area, transform = identity)` 不变签名，但内部改为 `rectsToSamplePoints(area.rects, 1, area.sampleHeight ?? 0)` 再 `map` 套 transform。`SAMPLE_SPACING = 1`。旧 `area.cells` 不再支持。

> 影响：`tests/unit/direct-sun.test.js` 的 fixture 用 `cells: [[0,0]]`，需改为等价 `rects: [{x0:0,z0:0,x1:1,z1:1}]`，其采样点与原 `[[0.25..],[0.75..]]`（每格 4 点）**会变**为每格 1 点 `[0.5,*,0.5]`。断言相应更新。`evaluateDirectSun` 的直射判定不依赖具体点数，其余断言（hasDirectSun/litRatio）在单点下仍成立（litRatio 变为 0/1）。

- [ ] **Step 1: 改 `sampleArea.js`**

```javascript
import { rectsToSamplePoints } from './rectsToSamplePoints.js';

const SAMPLE_SPACING = 1;
const identity = position => position;

export function sampleArea(area, transform = identity) {
  return rectsToSamplePoints(area.rects ?? [], SAMPLE_SPACING, area.sampleHeight ?? 0)
    .map(sample => ({ id: sample.id, position: transform(sample.position) }));
}
```

- [ ] **Step 2: 改 `direct-sun.test.js` 的 area fixture + 采样断言**

将顶部 `const area = { cells: [[0, 0]], sampleHeight: 0 };` 改为
`const area = { rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }], sampleHeight: 0 };`
并把 "creates four stable samples per square metre" 用例整体替换为：

```javascript
describe('observation sampling', () => {
  it('places one sample per square metre at the cell centre', () => {
    expect(sampleArea(area)).toEqual([
      { id: '1:1', position: [0.5, 0, 0.5] }
    ]);
  });
});
```

（其余 direct-sun 用例保留：lit/blocked/opening-selection/below-horizon —— 它们断言 hasDirectSun 与 litRatio，单点下 litRatio 为 1 或 0，仍通过；若某用例原断言 `litRatio` 为分数值，改为对应的 0/1。执行时以实际输出校正，但不得改变 hasDirectSun 语义。）

- [ ] **Step 3: 运行确认通过**

Run: `npx vitest run tests/unit/direct-sun.test.js`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add src/domain/simulation/sampleArea.js tests/unit/direct-sun.test.js
git commit -m "feat: sample observation areas from rects instead of cells"
```

---

### Task 3: deriveAperturesFromArea（矩形∩外墙→采光口）

**Files:**
- Create: `src/domain/simulation/deriveApertures.js`
- Test: `tests/unit/derive-apertures.test.js`

**Interfaces:**
- Consumes: `createFootprint`(现有)、`createWallSegments`(现有，返回局部墙段 `{ id, start:[x,z], end:[x,z], normal:[nx,nz], length }`)、`floorBaseY`(现有)、`rotateLocalToWorld`(现有)。
- Produces: `deriveAperturesFromArea(building, area) -> { portals, apertureWallIds }`：
  - `portals`: `Array<{ id, plane:{point:[x,y,z], normal:[x,y,z], tangent:[x,y,z]}, bounds:{minU,maxU,minV,maxV} }>`，世界坐标，与 `intersectOpening` 吃的格式一致（`v = point[1]` 世界 Y；`u` 沿 tangent，`minU/maxU` 相对 `point` 的中点对称）。
  - `apertureWallIds`: `Set<string>`，形如 `` `${building.id}:${wall.id}` ``，供调用方从 `buildObstacles` 排除（否则开孔墙自己会挡住光）。
  - 算法（footprint 墙段均为轴对齐线段）：对每面墙，取墙所在轴的固定坐标（竖墙 x=常数、横墙 z=常数）与墙沿其方向的区间；对每个矩形，若矩形在"垂直墙方向"的范围**跨过或恰好覆盖**墙的固定坐标，则求矩形沿墙方向的区间与墙区间的重叠 `[a,b]`；`b-a > EPS` 则该墙有一段开孔 `[a,b]`（多矩形对同一墙取各段，合并可选——本轮每段各生成一个 portal，不合并）。
  - 每段 `[a,b]`：局部两端点 P0、P1（墙上，沿墙方向），中点 M；`baseY = floorBaseY({floor: area.floor, ...building.params})`（sill 取 0，空腔从楼板起）；`height = building.params.floorHeight`。世界化 P0/P1/M（`rotateLocalToWorld` + `building.position`）；`tangent = normalize(world(P1)-world(P0))`；`normal = [rotateLocalToWorld(wall.normal)... ,0 分量补 y=0]`（外法线抬 3D）；`point=[Mworld.x, baseY, Mworld.z]`；`bounds={ minU:-len/2, maxU:len/2, minV:baseY, maxV:baseY+height }`，`len=b-a`。
  - 无重叠 → `portals:[], apertureWallIds: new Set()`。

- [ ] **Step 1: 写失败测试**

```javascript
import { describe, expect, it } from 'vitest';
import { deriveAperturesFromArea } from '../../src/domain/simulation/deriveApertures.js';

const bar = {
  id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
  params: { length: 60, depth: 18, floors: 3, floorHeight: 3 }
};
// bar footprint: x∈[-30,30], z∈[-9,9]; south wall (wall-outer-0) at z=-9, normal [0,-1]

describe('deriveAperturesFromArea', () => {
  it('opens the south wall where a rect crosses z=-9', () => {
    const area = { floor: 1, rects: [{ x0: -2, z0: -11, x1: 2, z1: -5 }] };
    const { portals, apertureWallIds } = deriveAperturesFromArea(bar, area);
    expect(portals).toHaveLength(1);
    expect(portals[0].plane.normal[2]).toBeCloseTo(-1, 6);   // faces south
    expect(portals[0].bounds.maxU - portals[0].bounds.minU).toBeCloseTo(4, 6); // span x -2..2
    expect(portals[0].bounds.minV).toBeCloseTo(0, 6);        // floor 1 baseY 0
    expect([...apertureWallIds]).toContain('b1:wall-outer-0');
  });

  it('no aperture when the rect stays inside, touching no wall', () => {
    const area = { floor: 1, rects: [{ x0: -2, z0: -2, x1: 2, z1: 2 }] };
    const { portals, apertureWallIds } = deriveAperturesFromArea(bar, area);
    expect(portals).toEqual([]);
    expect(apertureWallIds.size).toBe(0);
  });

  it('opens when a rect edge exactly coincides with the wall line', () => {
    const area = { floor: 1, rects: [{ x0: -3, z0: -9, x1: 3, z1: -4 }] };  // z0 == -9 exactly
    const { portals } = deriveAperturesFromArea(bar, area);
    expect(portals).toHaveLength(1);
    expect(portals[0].bounds.maxU - portals[0].bounds.minU).toBeCloseTo(6, 6);
  });

  it('respects floor height for baseY', () => {
    const area = { floor: 3, rects: [{ x0: -2, z0: -11, x1: 2, z1: -5 }] };
    const { portals } = deriveAperturesFromArea(bar, area);   // floorBaseY(3, fh3)=6
    expect(portals[0].bounds.minV).toBeCloseTo(6, 6);
    expect(portals[0].bounds.maxV).toBeCloseTo(9, 6);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/derive-apertures.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `deriveApertures.js`**

```javascript
import { createFootprint } from '../buildings/createFootprint.js';
import { createWallSegments } from '../buildings/createWallSegments.js';
import { floorBaseY } from '../buildings/floorMath.js';
import { rotateLocalToWorld } from '../buildings/wallGeometry.js';

const EPS = 1e-6;

export function deriveAperturesFromArea(building, area) {
  const walls = createWallSegments(createFootprint(building.template, building.params));
  const baseY = floorBaseY({ floor: area.floor, ...building.params });
  const height = building.params.floorHeight;
  const { x: px, z: pz } = building.position;
  const portals = [];
  const apertureWallIds = new Set();

  const toWorld = ([lx, lz]) => {
    const [wx, wz] = rotateLocalToWorld([lx, lz], building.rotation);
    return [wx + px, wz + pz];
  };

  for (const wall of walls) {
    const horizontal = Math.abs(wall.start[1] - wall.end[1]) < EPS; // z const → runs along x
    // fixed coord = the axis perpendicular to the wall; span = along the wall
    const fixed = horizontal ? wall.start[1] : wall.start[0];         // z (horiz) or x (vert)
    const wa = horizontal ? Math.min(wall.start[0], wall.end[0]) : Math.min(wall.start[1], wall.end[1]);
    const wb = horizontal ? Math.max(wall.start[0], wall.end[0]) : Math.max(wall.start[1], wall.end[1]);

    for (const rect of area.rects ?? []) {
      const perpMin = horizontal ? Math.min(rect.z0, rect.z1) : Math.min(rect.x0, rect.x1);
      const perpMax = horizontal ? Math.max(rect.z0, rect.z1) : Math.max(rect.x0, rect.x1);
      if (fixed < perpMin - EPS || fixed > perpMax + EPS) continue; // rect must cross/touch wall line
      const rMin = horizontal ? Math.min(rect.x0, rect.x1) : Math.min(rect.z0, rect.z1);
      const rMax = horizontal ? Math.max(rect.x0, rect.x1) : Math.max(rect.z0, rect.z1);
      const a = Math.max(wa, rMin);
      const b = Math.min(wb, rMax);
      if (b - a <= EPS) continue;

      const p0 = horizontal ? [a, fixed] : [fixed, a];
      const p1 = horizontal ? [b, fixed] : [fixed, b];
      const mid = horizontal ? [(a + b) / 2, fixed] : [fixed, (a + b) / 2];
      const w0 = toWorld(p0);
      const w1 = toWorld(p1);
      const wm = toWorld(mid);
      const dx = w1[0] - w0[0];
      const dz = w1[1] - w0[1];
      const len = Math.hypot(dx, dz);
      const [nx, nz] = rotateLocalToWorld(wall.normal, building.rotation);

      portals.push({
        id: `${wall.id}:${a.toFixed(3)}:${b.toFixed(3)}`,
        plane: {
          point: [wm[0], baseY, wm[1]],
          normal: [nx, 0, nz],
          tangent: [dx / len, 0, dz / len]
        },
        bounds: { minU: -len / 2, maxU: len / 2, minV: baseY, maxV: baseY + height }
      });
      apertureWallIds.add(`${building.id}:${wall.id}`);
    }
  }
  return { portals, apertureWallIds };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/derive-apertures.test.js`
Expected: PASS（4 用例）。若某数值差 EPS 量级，核对 `createWallSegments` 的 `wall-outer-0` 是否确为南墙 z=-9（见 `tests/unit/buildings.test.js` 已固定该约定），据实微调断言而非改语义。

- [ ] **Step 5: 提交**

```bash
git add src/domain/simulation/deriveApertures.js tests/unit/derive-apertures.test.js
git commit -m "feat: derive light apertures where observation rects reach outer walls"
```

---

### Task 4: 项目迁移 cells→rects

**Files:**
- Modify: `src/domain/project/migrateProject.js`
- Test: `tests/unit/migrate-project.test.js`（新增）

**Interfaces:**
- Produces: `migrateProject` 在克隆后，对每栋楼每个观察区：删除 `cells` 与 `openingIds` 字段，确保存在 `rects`（缺失则置 `[]`）。schemaVersion 校验不变。

- [ ] **Step 1: 写失败测试**

```javascript
import { describe, expect, it } from 'vitest';
import { migrateProject } from '../../src/domain/project/migrateProject.js';

describe('migrateProject cells->rects', () => {
  it('drops legacy cells/openingIds and ensures rects', () => {
    const raw = {
      schemaVersion: 1,
      buildings: [{
        id: 'b1',
        observationAreas: [{ id: 'a1', name: '客厅', floor: 1, cells: [[0, 0], [1, 0]], openingIds: ['o1'] }]
      }]
    };
    const out = migrateProject(raw);
    const area = out.buildings[0].observationAreas[0];
    expect(area.cells).toBeUndefined();
    expect(area.openingIds).toBeUndefined();
    expect(area.rects).toEqual([]);
    expect(area.name).toBe('客厅');
  });

  it('keeps existing rects untouched', () => {
    const raw = {
      schemaVersion: 1,
      buildings: [{ id: 'b1', observationAreas: [{ id: 'a1', floor: 1, rects: [{ x0: 0, z0: 0, x1: 2, z1: 1 }] }] }]
    };
    const out = migrateProject(raw);
    expect(out.buildings[0].observationAreas[0].rects).toEqual([{ x0: 0, z0: 0, x1: 2, z1: 1 }]);
  });

  it('still rejects unsupported versions', () => {
    expect(() => migrateProject({ schemaVersion: 2 })).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/migrate-project.test.js`
Expected: FAIL（cells 未删）。

- [ ] **Step 3: 实现**

```javascript
const CURRENT_SCHEMA_VERSION = 1;

export function migrateProject(rawProject) {
  const version = rawProject?.schemaVersion;
  if (!Number.isInteger(version) || version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`不支持的项目版本：${String(version)}`);
  }

  const project = structuredClone(rawProject);
  for (const building of project.buildings ?? []) {
    for (const area of building.observationAreas ?? []) {
      delete area.cells;
      delete area.openingIds;
      if (!Array.isArray(area.rects)) area.rects = [];
    }
  }
  return project;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/migrate-project.test.js`
Expected: PASS（3 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/domain/project/migrateProject.js tests/unit/migrate-project.test.js
git commit -m "feat: migrate observation areas from cells to rects, dropping legacy fields"
```

---

### Task 5: 控制器改用 rects 采样 + 自动开孔

**Files:**
- Modify: `src/features/results/createSimulationController.js`
- Test: `tests/unit/simulation-controller.test.js`（改造 fixture 为 rects）

**Interfaces:**
- Consumes: `deriveAperturesFromArea`(Task 3)、rects 版 `sampleArea`(Task 2)。
- Produces: `resolveDirectSun({ project, building, area })` 内部改为：`{ portals, apertureWallIds } = deriveAperturesFromArea(building, area)`；`obstacles = buildObstacles(project.buildings, { excludeWallIds: apertureWallIds })`；transform 不变。删除对 `area.openingIds`/`building.openings`/`buildOpeningPortals`/`resolveWallId` 的引用（这些手动开窗依赖不再用）。发布 state 结构不变（`hasDirectSun`/`litRatio`/`litSampleIds`/`noArea`/`areaOptions`/`activeAreaId`/`intervals:null`/`totalMinutes:null`）。

- [ ] **Step 1: 改造测试 fixture 为 rects + 自动开孔场景**

在 `tests/unit/simulation-controller.test.js`：把 `projectWithSouthWindow()` 里建筑的 `observationAreas[0]` 改为用跨南墙的矩形、删掉手动 openings：
```javascript
    observationAreas: [{
      id: 'area-a', name: '客厅', floor: 1,
      rects: [{ x0: -3, z0: -11, x1: 3, z1: -4 }],   // crosses south wall z=-9 => auto aperture
      sampleHeight: 1.2
    }],
    openings: []
```
现有断言（正午有直射 / 南加高楼变无直射 / noArea / areaOptions / setActiveArea）保持语义不变。执行时若"无遮挡有直射"不成立，允许微调 rect 或 time，但不得改断言语义。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/simulation-controller.test.js`
Expected: FAIL（控制器仍走 openingIds 路径，rects 无对应开口 → 恒无直射）。

- [ ] **Step 3: 改 `resolveDirectSun` + imports**

顶部 import：删 `buildOpeningPortals`、`resolveWallId`；`rotateLocalToWorld` 保留（transform 用）；新增 `import { deriveAperturesFromArea } from '../../domain/simulation/deriveApertures.js';`。

`resolveDirectSun` 改为：
```javascript
function resolveDirectSun({ project, building, area }) {
  const baseY = floorBaseY({ floor: area.floor, ...building.params }) + (area.sampleHeight ?? 0);
  const transform = ([lx, , lz]) => {
    const [wx, wz] = rotateLocalToWorld([lx, lz], building.rotation);
    return [wx + building.position.x, baseY, wz + building.position.z];
  };
  const { portals, apertureWallIds } = deriveAperturesFromArea(building, area);
  const obstacles = buildObstacles(project.buildings, { excludeWallIds: apertureWallIds });
  return { transform, portals, obstacles };
}
```

- [ ] **Step 4: 运行确认通过 + 全套回归**

Run: `npx vitest run tests/unit/simulation-controller.test.js` → PASS
Run: `npm test` → 全绿（direct-sun、derive-apertures、rects-to-samples、migrate-project 等）。

- [ ] **Step 5: 提交**

```bash
git add src/features/results/createSimulationController.js tests/unit/simulation-controller.test.js
git commit -m "feat: compute direct sun from auto-derived apertures on painted rects"
```

---

### Task 6: observationOverlay + analysisOverlays 改画矩形

**Files:**
- Modify: `src/scene/observationOverlay.js`
- Modify: `src/scene/analysisOverlays.js`
- Test: `tests/unit/scene-analysis.test.js`（改断言为 rects）

**Interfaces:**
- Consumes: `deriveAperturesFromArea`(Task 3)。
- Produces:
  - `createObservationOverlay({ rects, baseY, lit = false })` → THREE.Group：对每个 rect 画一块 `PlaneGeometry(width,depth)` 平放于 `baseY`，居中在 rect 中心；`lit` 为真用高亮材质，否则选中材质。（本轮整块按是否有任一被照点决定颜色即可——litSampleIds 精确到点的着色留后；`lit` 由 `analysisOverlays` 依据 `litSampleIds.length>0` 传入。）
  - `buildAnalysisOverlays(project, simulationState)`：`area` 描述改为 `{ rects, baseY, lit, group:{position,rotationDeg} }`；`openings` 改为从 `deriveAperturesFromArea(building, area).portals` 生成（center=`[point.x, (minV+maxV)/2, point.z]`，normal=`plane.normal`，width=`maxU-minU`，height=`maxV-minV`）。

- [ ] **Step 1: 改测试 `tests/unit/scene-analysis.test.js`**

fixture 的 area 改为 `rects: [{ x0:-3,z0:-11,x1:3,z1:-4 }], sampleHeight:1.2`、删 openings/openingIds。断言：
```javascript
  it('returns area rects + derived aperture openings for the active area', () => {
    const out = buildAnalysisOverlays(project, { activeAreaId: 'a', litSampleIds: ['1:1'], noArea: false });
    expect(out.area.rects).toEqual([{ x0:-3,z0:-11,x1:3,z1:-4 }]);
    expect(out.area.lit).toBe(true);
    expect(out.area.group).toMatchObject({ position: { x: 0, z: 0 }, rotationDeg: 0 });
    expect(out.openings.length).toBeGreaterThan(0);
  });
  it('returns null when noArea', () => {
    expect(buildAnalysisOverlays(project, { activeAreaId: null, litSampleIds: [], noArea: true })).toBeNull();
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/scene-analysis.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现**

`analysisOverlays.js`：
```javascript
import { floorBaseY } from '../domain/buildings/floorMath.js';
import { deriveAperturesFromArea } from '../domain/simulation/deriveApertures.js';

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
  const { portals } = deriveAperturesFromArea(building, area);
  return {
    area: {
      rects: area.rects ?? [],
      baseY,
      lit: (simulationState.litSampleIds ?? []).length > 0,
      group: { position: { x: building.position.x, z: building.position.z }, rotationDeg: building.rotation }
    },
    openings: portals.map(p => ({
      id: p.id,
      width: p.bounds.maxU - p.bounds.minU,
      height: p.bounds.maxV - p.bounds.minV,
      center: [p.plane.point[0], (p.bounds.minV + p.bounds.maxV) / 2, p.plane.point[2]],
      normal: p.plane.normal
    }))
  };
}
```

`observationOverlay.js`：
```javascript
import * as THREE from 'three';

const selectedMaterial = new THREE.MeshBasicMaterial({
  color: 0x4b6f78, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false
});
const litMaterial = new THREE.MeshBasicMaterial({
  color: 0xf3bd4f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false
});

export function createObservationOverlay({ rects, baseY, lit = false }) {
  const group = new THREE.Group();
  group.name = 'observation-overlay';
  group.userData.kind = 'observation-overlay';
  for (const rect of rects ?? []) {
    const w = Math.abs(rect.x1 - rect.x0);
    const d = Math.abs(rect.z1 - rect.z0);
    if (w <= 0 || d <= 0) continue;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lit ? litMaterial : selectedMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((rect.x0 + rect.x1) / 2, baseY + 0.018, (rect.z0 + rect.z1) / 2);
    mesh.userData.kind = 'observation-rect';
    group.add(mesh);
  }
  return group;
}
```

> `createSceneController` 里调用 `createObservationOverlay` 的地方（analysisOverlays 的消费处）把 `cells/litSampleIds` 改为传 `rects/lit`——在本任务顺带改到（它已 import 该函数）。核对 `createSceneController.updateAnalysis` 中构造 overlay 的实参，改为 `{ rects: overlays.area.rects, baseY: overlays.area.baseY, lit: overlays.area.lit }`。

- [ ] **Step 4: 运行确认通过 + 构建**

Run: `npx vitest run tests/unit/scene-analysis.test.js` → PASS
Run: `npm run build` → 成功。

- [ ] **Step 5: 提交**

```bash
git add src/scene/observationOverlay.js src/scene/analysisOverlays.js src/scene/createSceneController.js tests/unit/scene-analysis.test.js
git commit -m "feat: render observation areas and derived apertures as rectangles"
```

---

### Task 7: floorFocus 楼层聚焦(纯决策 + Three 构造)

**Files:**
- Create: `src/scene/floorFocus.js`
- Test: `tests/unit/floor-focus.test.js`

**Interfaces:**
- Consumes: `createFootprint`、`floorBaseY`、`totalBuildingHeight`（现有）。
- Produces（纯函数 + 一个 Three 构造，纯函数单测、Three 部分 e2e 覆盖）：
  - `floorFocusTarget(building, floor) -> { target:{x,y,z}, height:number }`：`target` = 建筑世界位置 + 该楼层高度（`floorBaseY(floor)`），`y` 取该层楼板高度；`height` = 一个够高的俯视距离（如 `Math.max(building.params.length, building.params.depth) * 1.2 + 60`）。供 `cameraRig.setTopView(target, height)`。
  - `floorVisibility(buildings, selectedBuildingId) -> (buildingId) => boolean`：仅 `selectedBuildingId` 可见。供 main 控制建筑网格显隐。
  - `createFloorSlab(building, floor)` → THREE.Group：该层 footprint 的一块薄板 + 淡 1m 参考线（GridHelper 裁到 footprint 包围盒即可），放在楼层高度。（Three 构造，仅 e2e 覆盖；纯函数不测它。）

- [ ] **Step 1: 写失败测试(纯函数)**

```javascript
import { describe, expect, it } from 'vitest';
import { floorFocusTarget, floorVisibility } from '../../src/scene/floorFocus.js';

const bar = { id:'b1', template:'bar', position:{x:10,z:-4}, rotation:0,
  params:{ length:60, depth:18, floors:5, floorHeight:3 } };

describe('floorFocus', () => {
  it('targets the selected floor height above the building position', () => {
    const { target, height } = floorFocusTarget(bar, 3);   // floorBaseY(3, fh3) = 6
    expect(target).toEqual({ x: 10, y: 6, z: -4 });
    expect(height).toBeGreaterThan(60);
  });
  it('makes only the selected building visible', () => {
    const vis = floorVisibility([{ id:'b1' }, { id:'b2' }], 'b1');
    expect(vis('b1')).toBe(true);
    expect(vis('b2')).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/floor-focus.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现** `floorFocus.js`（纯函数 + Three 构造）

```javascript
import * as THREE from 'three';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { floorBaseY } from '../domain/buildings/floorMath.js';

export function floorFocusTarget(building, floor) {
  const y = floorBaseY({ floor, ...building.params });
  const span = Math.max(building.params.length, building.params.depth);
  return { target: { x: building.position.x, y, z: building.position.z }, height: span * 1.2 + 60 };
}

export function floorVisibility(buildings, selectedBuildingId) {
  return buildingId => buildingId === selectedBuildingId;
}

const slabMaterial = new THREE.MeshBasicMaterial({
  color: 0xdfe6e9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false
});

export function createFloorSlab(building, floor) {
  const footprint = createFootprint(building.template, building.params);
  const outer = Array.isArray(footprint) ? footprint : footprint.outer;
  const shape = new THREE.Shape();
  outer.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  const y = floorBaseY({ floor, ...building.params });
  const group = new THREE.Group();
  group.name = 'floor-slab';
  group.userData.kind = 'floor-slab';
  const slab = new THREE.Mesh(new THREE.ShapeGeometry(shape), slabMaterial);
  slab.rotation.x = -Math.PI / 2;
  slab.position.y = y + 0.01;
  group.add(slab);
  const xs = outer.map(p => p[0]);
  const zs = outer.map(p => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const grid = new THREE.GridHelper(Math.ceil(size), Math.ceil(size), 0x9fb0b6, 0xc3ced2);
  grid.position.set((Math.min(...xs) + Math.max(...xs)) / 2, y + 0.012, (Math.min(...zs) + Math.max(...zs)) / 2);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  group.add(grid);
  group.position.set(building.position.x, 0, building.position.z);
  group.rotation.y = THREE.MathUtils.degToRad(building.rotation);
  return group;
}
```

- [ ] **Step 4: 运行确认通过 + 构建**

Run: `npx vitest run tests/unit/floor-focus.test.js` → PASS
Run: `npm run build` → 成功。

- [ ] **Step 5: 提交**

```bash
git add src/scene/floorFocus.js tests/unit/floor-focus.test.js
git commit -m "feat: floor-focus camera target, visibility, and slab for top-down editing"
```

---

### Task 8: areaDrag 俯视拖拽画矩形(纯换算 + 交互)

**Files:**
- Create: `src/scene/areaDrag.js`
- Test: `tests/unit/area-drag.test.js`

**Interfaces:**
- Consumes: `rotateLocalToWorld`(现有；此处需其逆——见实现)。
- Produces:
  - `worldToLocalFloor(worldXZ, building) -> [lx, lz]`：世界 XZ → 建筑局部 XZ（减位移后按 `-rotation` 逆旋转）。纯。
  - `normalizeRect(p0, p1) -> { x0, z0, x1, z1 }`：两点 → 规整矩形（本设计存原始角即可，规整只保证非退化）。纯。
  - `applyRectEdit(rects, rect, mode) -> rects'`：`mode==='draw'` 追加；`mode==='erase'` 从每个已有 rect 中减去与 `rect` 相交的部分（矩形差集，产生 0–4 个子矩形）。纯。
  - `createAreaDrag({ canvas, camera, floorY, getBuilding, getMode, onCommit })`：pointerdown 记起点(射线打 `y=floorY` 平面→世界→`worldToLocalFloor`)、move 预览、up 出 `rect` 并按 `getMode()` 调 `onCommit(rect, mode)`。`getMode()` 返回 `'draw'|'erase'|'move'`；`'move'` 时不画(交给相机控制)。返回 `{ dispose }`。（交互部分 e2e 覆盖；本任务只单测三个纯函数。）

- [ ] **Step 1: 写失败测试(纯函数)**

```javascript
import { describe, expect, it } from 'vitest';
import { worldToLocalFloor, normalizeRect, applyRectEdit } from '../../src/scene/areaDrag.js';

describe('areaDrag pure helpers', () => {
  it('worldToLocalFloor inverts position and rotation (0deg)', () => {
    const b = { position: { x: 10, z: -4 }, rotation: 0 };
    expect(worldToLocalFloor([12, -1], b)).toEqual([2, 3]);
  });
  it('worldToLocalFloor inverts a 90deg rotation', () => {
    const b = { position: { x: 0, z: 0 }, rotation: 90 };
    const [lx, lz] = worldToLocalFloor([0, -1], b); // world of local [1,0] at 90deg is [0,-1]
    expect(lx).toBeCloseTo(1, 6);
    expect(lz).toBeCloseTo(0, 6);
  });
  it('normalizeRect keeps corners', () => {
    expect(normalizeRect([1, 2], [3, 5])).toEqual({ x0: 1, z0: 2, x1: 3, z1: 5 });
  });
  it('draw appends a rect', () => {
    expect(applyRectEdit([], { x0:0,z0:0,x1:1,z1:1 }, 'draw')).toEqual([{ x0:0,z0:0,x1:1,z1:1 }]);
  });
  it('erase removes a fully covered rect', () => {
    const out = applyRectEdit([{ x0:0,z0:0,x1:2,z1:2 }], { x0:-1,z0:-1,x1:3,z1:3 }, 'erase');
    expect(out).toEqual([]);
  });
  it('erase splits a rect when cutting its middle', () => {
    const out = applyRectEdit([{ x0:0,z0:0,x1:3,z1:1 }], { x0:1,z0:-1,x1:2,z1:2 }, 'erase');
    // leaves left [0..1] and right [2..3] strips
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/area-drag.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现** `areaDrag.js`

```javascript
import * as THREE from 'three';

const DEG = Math.PI / 180;

export function worldToLocalFloor([wx, wz], building) {
  const dx = wx - building.position.x;
  const dz = wz - building.position.z;
  const t = -building.rotation * DEG;          // inverse rotation
  const c = Math.cos(t);
  const s = Math.sin(t);
  // inverse of rotateLocalToWorld (x' = x c + z s ; z' = -x s + z c) is the transpose:
  return [dx * c - dz * s, dx * s + dz * c];
}

export function normalizeRect(p0, p1) {
  return { x0: p0[0], z0: p0[1], x1: p1[0], z1: p1[1] };
}

function xmin(r){return Math.min(r.x0,r.x1);} function xmax(r){return Math.max(r.x0,r.x1);}
function zmin(r){return Math.min(r.z0,r.z1);} function zmax(r){return Math.max(r.z0,r.z1);}

function subtractRect(r, cut) {
  const ax0=xmin(r),ax1=xmax(r),az0=zmin(r),az1=zmax(r);
  const bx0=xmin(cut),bx1=xmax(cut),bz0=zmin(cut),bz1=zmax(cut);
  if (bx1<=ax0||bx0>=ax1||bz1<=az0||bz0>=az1) return [r];          // no overlap
  const ix0=Math.max(ax0,bx0),ix1=Math.min(ax1,bx1),iz0=Math.max(az0,bz0),iz1=Math.min(az1,bz1);
  const parts=[];
  if (az0<iz0) parts.push({x0:ax0,z0:az0,x1:ax1,z1:iz0});          // top strip
  if (iz1<az1) parts.push({x0:ax0,z0:iz1,x1:ax1,z1:az1});          // bottom strip
  if (ax0<ix0) parts.push({x0:ax0,z0:iz0,x1:ix0,z1:iz1});          // left strip
  if (ix1<ax1) parts.push({x0:ix1,z0:iz0,x1:ax1,z1:iz1});          // right strip
  return parts;
}

export function applyRectEdit(rects, rect, mode) {
  if (mode === 'erase') return rects.flatMap(r => subtractRect(r, rect));
  return [...rects, rect];
}

export function createAreaDrag({ canvas, camera, floorY, getBuilding, getMode, onCommit }) {
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let start = null;

  function localAt(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return worldToLocalFloor([hit.x, hit.z], getBuilding());
  }
  function onDown(e){ if (getMode()==='move') return; start = localAt(e); }
  function onUp(e){
    if (!start || getMode()==='move') { start=null; return; }
    const end = localAt(e); start2:{ if (!end) break start2; onCommit(normalizeRect(start, end), getMode()); }
    start=null;
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  return { dispose(){ canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); } };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/unit/area-drag.test.js`
Expected: PASS（6 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/scene/areaDrag.js tests/unit/area-drag.test.js
git commit -m "feat: top-down drag helpers to draw and erase observation rectangles"
```

---

### Task 9: 悬浮工具条 + 接线 + e2e

**Files:**
- Create: `src/features/areas/createAreaFloorTool.js`
- Delete: `src/features/areas/AreaPainter.js`, `src/features/areas/AreaInspector.js`, `src/features/areas/ObservationAreaSection.js`
- Modify: `src/features/buildings/BuildingInspector.js`, `src/scene/createSceneController.js`, `src/main.js`
- Test: `tests/unit/area-floor-tool.test.js`（jsdom）; Create `tests/e2e/area-topdown.spec.js`

**Interfaces:**
- Consumes: `createUpdateObservationAreaCommand`, `createAddObservationAreaCommand`, `createSetEditorModeCommand`（现有/上轮）。
- Produces:
  - `createAreaFloorTool({ store, buildingId }) -> { element, update(building) }`：悬浮工具条 DOM。三态工具按钮（`data-testid` `tool-move`/`tool-draw`/`tool-erase`，`aria-pressed`）、楼层输入、名称输入、观察区下拉+`＋新观察区`、返回(`inspector-back` → `createSetEditorModeCommand('none')`)。暴露当前工具供场景查询：把当前工具写到 `element.dataset.tool`（`move|draw|erase`），场景的 `getMode` 读它。
  - `BuildingInspector` areas 分支：`element.replaceChildren(tool.element)`（不再是 ObservationAreaSection）。
  - `createSceneController`：新增 `enterFloorFocus(project, simulationState)` / `exitFloorFocus()`：进入时 `setTopView(floorFocusTarget)`、按 `floorVisibility` 隐藏其它楼、加 `createFloorSlab`、`createAreaDrag`（`getMode` 读工具条 `dataset.tool`，`onCommit` → `store.execute(createUpdateObservationAreaCommand(buildingId, areaId, { rects: applyRectEdit(...) }))`）、锁 `controls.enabled = (tool==='move')`；退出时还原。
  - `main.js`：订阅里 `editorMode==='areas'` → `enterFloorFocus`；离开 → `exitFloorFocus`。

- [ ] **Step 1: 写工具条失败测试(jsdom)**

```javascript
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createAreaFloorTool } from '../../src/features/areas/createAreaFloorTool.js';

function building() {
  return { id:'b1', params:{ floors:5 }, observationAreas:[{ id:'a1', name:'客厅', floor:1, rects:[] }] };
}
const q = (el,id) => el.querySelector(`[data-testid="${id}"]`);

describe('createAreaFloorTool', () => {
  it('defaults to draw tool and exposes it on dataset', () => {
    const { element, update } = createAreaFloorTool({ store: { execute: vi.fn() }, buildingId: 'b1' });
    update(building());
    expect(element.dataset.tool).toBe('draw');
  });
  it('switches tool on click', () => {
    const { element, update } = createAreaFloorTool({ store: { execute: vi.fn() }, buildingId: 'b1' });
    update(building());
    q(element, 'tool-move').click();
    expect(element.dataset.tool).toBe('move');
    q(element, 'tool-erase').click();
    expect(element.dataset.tool).toBe('erase');
  });
  it('back returns to overview', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    q(element, 'inspector-back').click();
    expect(store.execute.mock.calls[0][0].label).toBe('切换编辑模式');
  });
  it('changing floor dispatches an update', () => {
    const store = { execute: vi.fn() };
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    const floor = q(element, 'area-floor');
    floor.value = '3'; floor.dispatchEvent(new window.Event('change'));
    expect(store.execute).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/unit/area-floor-tool.test.js`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现工具条 + 删旧文件 + 接线**

实现 `createAreaFloorTool.js`（用 `createElement`；三态按钮切换时更新 `element.dataset.tool` 与各按钮 `aria-pressed`；楼层/名称 change → `createUpdateObservationAreaCommand`；下拉切换 → `createUpdateObservationAreaCommand`?不——切换 activeArea 用 `simulation.activeAreaId`，本轮用 `createUpdateObservationAreaCommand` 不合适；改用现有 `setActiveArea`（simulationController）或直接 store patch。**简化**：本轮工具条的"多区切换"写 `store.execute({ label:'切换观察区', apply: p => ({...p, simulation:{...p.simulation, activeAreaId }}) })`；`＋新观察区` 用 `createAddObservationAreaCommand(buildingId, { id, name, floor, rects:[], sampleHeight:0 })`）。返回按钮 → `createSetEditorModeCommand('none')`。

```bash
git rm src/features/areas/AreaPainter.js src/features/areas/AreaInspector.js src/features/areas/ObservationAreaSection.js
```

`BuildingInspector.js`：import 改为 `createAreaFloorTool`；areas 分支：
```javascript
    } else if (mode === 'areas') {
      areaTool = createAreaFloorTool({ store, buildingId: building.id });
      areaTool.update(building);
      element.replaceChildren(areaTool.element);
    }
```
（把原 `areaSection` 变量名改为 `areaTool`，key 相同时 `areaTool.update(building)`。）

`createSceneController.js` + `main.js`：按 Interfaces 加 `enterFloorFocus/exitFloorFocus` 并在 `editorMode==='areas'` 进出时调用；`createAreaDrag` 的 `getMode` 读 `document.querySelector('.area-floor-tool')?.dataset.tool ?? 'move'`，`controls.enabled = tool==='move'`（拖拽时锁镜头）。

- [ ] **Step 4: 运行工具条测试 + 全套 + 构建**

Run: `npx vitest run tests/unit/area-floor-tool.test.js` → PASS
Run: `npm test` → 全绿（旧 AreaPainter/ObservationAreaSection 相关测试若存在需一并删除或改写；确认无残留 import）。
Run: `npm run build` → 成功。

- [ ] **Step 5: 写 e2e `tests/e2e/area-topdown.spec.js`**

```javascript
import { expect, test } from '@playwright/test';

test('area editing enters top-down floor tool', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: '完成' }).click();
  await page.getByTestId('overview-edit-areas').click();
  // right panel hidden, floor tool visible
  await expect(page.getByTestId('results-panel')).toHaveCount(0);
  await expect(page.getByTestId('tool-draw')).toBeVisible();
  await expect(page.getByTestId('area-floor')).toBeVisible();
  await page.getByTestId('inspector-back').click();
  await expect(page.getByTestId('building-overview')).toBeVisible();
});
```

- [ ] **Step 6: e2e 解析 + 交付验证**

Run: `npx playwright test area-topdown.spec.js --list` → 列出 desktop+mobile。
Run: `npm test && npm run build` → 全绿 + 成功。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: top-down floor editing tool replacing the abstract grid control"
```

## Self-Review

- **Spec 覆盖**：俯视只显示选中楼层→Task 7(floorFocus)+9(接线);拖连续矩形/画擦/楼板外起手→Task 8+9;右栏隐藏+悬浮工具条→Task 9;空腔自动开孔(严格跨线/贴合)→Task 3;真实日照→Task 5;矩形高亮→Task 6;cells→rects 数据+迁移丢弃→Task 2+4;无级采样内部化→Task 1+2。手动摆窗/侧壁自遮挡明确非目标,未纳入。验收标准逐条有归属。
- **Placeholder 扫描**：无 TBD/TODO;域层任务含完整代码;场景/UI 任务给出关键片段 + 精确接口 + 断言,Three 构造部分明确标注由 e2e 覆盖;fixture 微调点标注"不得改语义"。
- **类型一致**：`rects:[{x0,z0,x1,z1}]` 全程一致;`rectsToSamplePoints(rects,spacing,sampleHeight)`(1)→`sampleArea`(2)消费一致;`deriveAperturesFromArea(building,area)->{portals,apertureWallIds}`(3)→控制器(5)与 analysisOverlays(6)消费一致(portals 的 `plane/bounds` 结构与 `intersectOpening` 契约一致);`createObservationOverlay({rects,baseY,lit})`(6) 与 createSceneController 调用一致;`floorFocusTarget/floorVisibility/createFloorSlab`(7)、`worldToLocalFloor/normalizeRect/applyRectEdit/createAreaDrag`(8)、`createAreaFloorTool({store,buildingId})->{element,update}`(9) 在定义与接线处签名一致;`data-testid`:`tool-move/tool-draw/tool-erase/area-floor/inspector-back/overview-edit-areas/building-overview/results-panel` 跨任务一致。
- **迁移安全**：Task 2 改采样会让 direct-sun 采样断言变化——同任务内改。Task 5 前 sampleArea 已消费 rects(Task 2),控制器 fixture 同任务改。删文件集中在 Task 9,此前不引用被删文件。




