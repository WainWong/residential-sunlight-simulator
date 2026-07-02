# Residential Sunlight Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, static residential sunlight simulator that supports multi-building scenes, observation-area painting, opening-aware direct-sun calculations, daily timelines, and local project files.

**Architecture:** Keep the solar and geometry engine independent from Three.js and the DOM. A small command store owns project state; UI features issue validated commands, the scene renders derived geometry, and a Web Worker computes daily results without blocking interaction.

**Tech Stack:** Vite, vanilla JavaScript ES modules, Three.js, SunCalc, Luxon, Vitest, Playwright, CSS, Web Workers

---

## File map

```text
index.html                         Application mount point
package.json                       Scripts and pinned dependencies
vite.config.js                     Vite and Vitest configuration
playwright.config.js               Desktop/mobile browser projects
vercel.json                        Static deployment configuration
src/main.js                        Application composition root
src/styles/                        Tokens, layout, controls, responsive rules
src/domain/project/                Schema, defaults, validation, migrations
src/domain/buildings/              Template footprints and floor math
src/domain/solar/                  Solar position and local-day boundaries
src/domain/simulation/             Portal, ray, sampling, interval analysis
src/store/                         Commands, immutable state, subscriptions
src/scene/                         Three.js renderer, meshes, picking, overlays
src/features/                      Wizard and focused product features
src/ui/                            Reusable DOM components and notifications
src/workers/                       Daily-analysis worker and client
src/data/cities.js                 Offline city/location presets
tests/unit/                        Domain and store tests
tests/fixtures/                    Stable project and scenario fixtures
tests/e2e/                         Desktop/mobile user journeys
public/examples/                   Importable example projects
```

## Milestone 1: Foundation and domain contracts

### Task 1: Scaffold the static application and test harness

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.js`
- Create: `playwright.config.js`
- Create: `vercel.json`
- Create: `src/main.js`
- Create: `src/styles/tokens.css`
- Create: `src/styles/base.css`
- Test: `tests/unit/smoke.test.js`

- [ ] **Step 1: Write the failing smoke test**

```js
// tests/unit/smoke.test.js
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../src/main.js';

describe('application bootstrap', () => {
  it('exports the product name', () => {
    expect(APP_NAME).toBe('日照 · 住宅采光模拟器');
  });
});
```

- [ ] **Step 2: Create package scripts and install dependencies**

```json
{
  "name": "residential-sunlight-simulator",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "luxon": "3.7.2",
    "suncalc": "1.9.0",
    "three": "0.185.0"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "vite": "8.1.0",
    "vitest": "4.1.9"
  }
}
```

Run: `npm install`  
Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 3: Run the smoke test and confirm it fails**

Run: `npm test -- tests/unit/smoke.test.js`  
Expected: FAIL because `src/main.js` does not exist.

- [ ] **Step 4: Add the smallest working page**

```js
// src/main.js
export const APP_NAME = '日照 · 住宅采光模拟器';

export function mountApp(root) {
  root.innerHTML = `<main class="boot"><h1>${APP_NAME}</h1><p>正在准备场景…</p></main>`;
}

const root = document.querySelector('#app');
if (root) mountApp(root);
```

```html
<!-- index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#17212b">
    <title>日照 · 住宅采光模拟器</title>
    <link rel="stylesheet" href="/src/styles/tokens.css">
    <link rel="stylesheet" href="/src/styles/base.css">
  </head>
  <body><div id="app"></div><script type="module" src="/src/main.js"></script></body>
</html>
```

- [ ] **Step 5: Verify tests and production build**

Run: `npm test -- tests/unit/smoke.test.js`  
Expected: PASS.

Run: `npm run build`  
Expected: `dist/index.html` is generated without errors.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json index.html vite.config.js playwright.config.js vercel.json src tests
git commit -m "chore: scaffold sunlight simulator"
```

### Task 2: Define the versioned project schema and validation

**Files:**
- Create: `src/domain/project/defaultProject.js`
- Create: `src/domain/project/validateProject.js`
- Create: `src/domain/project/migrateProject.js`
- Test: `tests/unit/project-schema.test.js`

- [ ] **Step 1: Write schema tests**

```js
import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { validateProject } from '../../src/domain/project/validateProject.js';

describe('project schema', () => {
  it('creates a valid version-one project', () => {
    const project = createDefaultProject();
    expect(project.schemaVersion).toBe(1);
    expect(validateProject(project)).toEqual({ ok: true, errors: [] });
  });

  it('reports a precise invalid building height', () => {
    const project = createDefaultProject();
    project.buildings.push({
      id: 'building-a', name: '建筑 A', template: 'bar',
      position: { x: 0, z: 0 }, rotation: 0,
      params: { length: 60, depth: 18, floors: 0, floorHeight: 3 },
      observationAreas: [], openings: []
    });
    expect(validateProject(project).errors[0]).toContain('建筑 A');
    expect(validateProject(project).errors[0]).toContain('楼层数');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/unit/project-schema.test.js`  
Expected: FAIL because schema modules do not exist.

- [ ] **Step 3: Implement defaults, explicit validation, and migration**

```js
// src/domain/project/defaultProject.js
export function createDefaultProject() {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: '未命名项目',
    location: { cityId: 'shenzhen', latitude: 22.5431, longitude: 114.0579, timeZone: 'Asia/Shanghai' },
    buildings: [],
    simulation: { date: '2026-12-21', time: '09:30', activeAreaId: null, sampleHeight: 0 },
    view: { camera: null, activePanel: 'buildings', wizardComplete: false }
  };
}
```

`validateProject(project)` must return `{ ok, errors }`, reject non-finite coordinates, dimensions outside `0.1–1000`, floors outside `1–200`, floor heights outside `2–10`, unknown template/opening types, duplicate IDs, cells outside their footprint, and openings outside their selected wall segment.

`migrateProject(raw)` must clone version 1 unchanged and reject missing, future, or non-integer versions with `Error('不支持的项目版本：…')`.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/unit/project-schema.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/project tests/unit/project-schema.test.js
git commit -m "feat: add versioned project schema"
```

### Task 3: Implement the command store with undo and stale-result protection

**Files:**
- Create: `src/store/createStore.js`
- Create: `src/store/commands.js`
- Test: `tests/unit/store.test.js`

- [ ] **Step 1: Write state-transition tests**

```js
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';

it('notifies once and can undo a named command', () => {
  const store = createStore(createDefaultProject());
  const listener = vi.fn();
  store.subscribe(listener);
  store.execute({ label: 'rename', apply: state => ({ ...state, name: '阳光项目' }) });
  expect(store.getState().name).toBe('阳光项目');
  store.undo();
  expect(store.getState().name).toBe('未命名项目');
  expect(listener).toHaveBeenCalledTimes(2);
});

it('ignores results from an older analysis request', () => {
  const store = createStore(createDefaultProject());
  const first = store.beginAnalysis();
  const second = store.beginAnalysis();
  expect(store.completeAnalysis(first, { intervals: [] })).toBe(false);
  expect(store.completeAnalysis(second, { intervals: [] })).toBe(true);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/unit/store.test.js`  
Expected: FAIL because `createStore` is missing.

- [ ] **Step 3: Implement the store contract**

`createStore(initialState)` must expose:

```js
{
  getState(),
  subscribe(listener),
  execute({ label, apply }),
  undo(),
  redo(),
  replaceProject(validProject),
  beginAnalysis(),
  completeAnalysis(requestId, result)
}
```

Keep at most 50 undo entries. View-only camera changes use `setView(patch)` and are not added to undo history.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/unit/store.test.js`  
Expected: PASS.

```powershell
git add src/store tests/unit/store.test.js
git commit -m "feat: add project command store"
```

## Milestone 2: Calculation engine

### Task 4: Add timezone-safe solar position calculations

**Files:**
- Create: `src/data/cities.js`
- Create: `src/domain/solar/getSolarPosition.js`
- Create: `src/domain/solar/getDaylightWindow.js`
- Test: `tests/unit/solar.test.js`

- [ ] **Step 1: Write reference-case tests**

```js
import { expect, it } from 'vitest';
import { getSolarPosition } from '../../src/domain/solar/getSolarPosition.js';

it('places Shenzhen winter-solstice noon sun in the southern sky', () => {
  const result = getSolarPosition({
    latitude: 22.5431, longitude: 114.0579,
    timeZone: 'Asia/Shanghai', localDate: '2026-12-21', localTime: '12:00'
  });
  expect(result.altitudeDeg).toBeGreaterThan(40);
  expect(result.azimuthDeg).toBeGreaterThan(160);
  expect(result.azimuthDeg).toBeLessThan(200);
  expect(result.direction.y).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/unit/solar.test.js`  
Expected: FAIL because the solar module is missing.

- [ ] **Step 3: Implement conversion and direction conventions**

Use Luxon to convert `{ localDate, localTime, timeZone }` to a JavaScript `Date`, then SunCalc for solar angles. Return azimuth in degrees clockwise from north and a normalized Three-compatible direction where `x=east`, `y=up`, `z=north`.

```js
return {
  altitudeDeg,
  azimuthDeg,
  aboveHorizon: altitudeRad > 0,
  direction: {
    x: Math.sin(azimuthRad) * Math.cos(altitudeRad),
    y: Math.sin(altitudeRad),
    z: Math.cos(azimuthRad) * Math.cos(altitudeRad)
  }
};
```

- [ ] **Step 4: Add daylight-window tests, run, and commit**

Run: `npm test -- tests/unit/solar.test.js`  
Expected: PASS.

```powershell
git add src/data src/domain/solar tests/unit/solar.test.js
git commit -m "feat: add timezone-safe solar calculations"
```

### Task 5: Generate the three building footprints and wall segments

**Files:**
- Create: `src/domain/buildings/templates.js`
- Create: `src/domain/buildings/createFootprint.js`
- Create: `src/domain/buildings/createWallSegments.js`
- Create: `src/domain/buildings/floorMath.js`
- Test: `tests/unit/buildings.test.js`

- [ ] **Step 1: Write footprint invariants**

```js
import { expect, it } from 'vitest';
import { createFootprint } from '../../src/domain/buildings/createFootprint.js';

it('creates a counter-clockwise bar footprint', () => {
  expect(createFootprint('bar', { length: 60, depth: 18 })).toEqual([
    [-30, -9], [30, -9], [30, 9], [-30, 9]
  ]);
});

it('creates a courtyard as an outer ring plus clockwise hole', () => {
  const shape = createFootprint('courtyard', {
    length: 60, depth: 40, courtyardLength: 30, courtyardDepth: 16
  });
  expect(shape.outer).toHaveLength(4);
  expect(shape.holes[0]).toHaveLength(4);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/unit/buildings.test.js`  
Expected: FAIL because footprint functions are missing.

- [ ] **Step 3: Implement templates**

Template keys and required parameters are fixed:

```js
export const BUILDING_TEMPLATES = {
  bar: ['length', 'depth'],
  lShape: ['length', 'depth', 'wingLength', 'wingDepth'],
  courtyard: ['length', 'depth', 'courtyardLength', 'courtyardDepth']
};
```

Return polygon rings in local `x,z` coordinates, wall segments with stable IDs, inward/outward normals, and `floorBaseY({ floor, firstFloorHeight, floorHeight })`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/unit/buildings.test.js`  
Expected: PASS.

```powershell
git add src/domain/buildings tests/unit/buildings.test.js
git commit -m "feat: add parameterized building footprints"
```

### Task 6: Implement observation sampling and portal-aware ray tests

**Files:**
- Create: `src/domain/simulation/vector.js`
- Create: `src/domain/simulation/sampleArea.js`
- Create: `src/domain/simulation/intersectOpening.js`
- Create: `src/domain/simulation/intersectObstacles.js`
- Create: `src/domain/simulation/evaluateDirectSun.js`
- Test: `tests/unit/direct-sun.test.js`

- [ ] **Step 1: Write the unobstructed and blocked scenarios**

```js
import { expect, it } from 'vitest';
import { evaluateDirectSun } from '../../src/domain/simulation/evaluateDirectSun.js';

const area = { cells: [[0, 0]], sampleHeight: 0 };
const southWindow = {
  id: 'window-1', type: 'window',
  plane: { point: [0, 1.5, -2], normal: [0, 0, -1] },
  bounds: { minU: -1, maxU: 1, minV: 0.8, maxV: 2.2 }
};

it('lights samples that pass through an opening', () => {
  const result = evaluateDirectSun({
    area, openings: [southWindow], obstacles: [],
    sunDirection: [0, 0.6, -0.8]
  });
  expect(result.hasDirectSun).toBe(true);
  expect(result.litRatio).toBeGreaterThan(0);
});

it('blocks the same samples behind another building', () => {
  const result = evaluateDirectSun({
    area, openings: [southWindow],
    obstacles: [{ min: [-3, 0, -20], max: [3, 20, -5] }],
    sunDirection: [0, 0.6, -0.8]
  });
  expect(result.hasDirectSun).toBe(false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/unit/direct-sun.test.js`  
Expected: FAIL because the simulation modules are missing.

- [ ] **Step 3: Implement the pure calculation pipeline**

`sampleArea(area)` returns four deterministic sample points per selected square metre. `intersectOpening(origin, direction, opening)` returns a positive distance only when the ray approaches the opening from inside and the intersection is within its rectangle. `intersectObstacles` tests AABBs and balcony slabs beyond the portal distance.

`evaluateDirectSun` must return:

```js
{
  hasDirectSun: boolean,
  litRatio: number,
  litSampleIds: string[],
  openingHits: Record<string, number>
}
```

- [ ] **Step 4: Add balcony-roof and multi-opening tests**

Run: `npm test -- tests/unit/direct-sun.test.js`  
Expected: PASS for unobstructed, blocked, balcony, and alternative-opening cases.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/simulation tests/unit/direct-sun.test.js
git commit -m "feat: add opening-aware direct sun engine"
```

### Task 7: Compute daily direct-sun intervals in a cancellable worker

**Files:**
- Create: `src/domain/simulation/analyzeDay.js`
- Create: `src/workers/dailyAnalysis.worker.js`
- Create: `src/workers/createAnalysisClient.js`
- Test: `tests/unit/analyze-day.test.js`

- [ ] **Step 1: Write interval-refinement tests**

```js
import { expect, it } from 'vitest';
import { analyzeDay } from '../../src/domain/simulation/analyzeDay.js';

it('refines state changes to one-minute boundaries', () => {
  const result = analyzeDay({
    startMinute: 360, endMinute: 1080, coarseStep: 5,
    evaluate: minute => minute >= 552 && minute < 878
  });
  expect(result.intervals).toEqual([{ startMinute: 552, endMinute: 878 }]);
  expect(result.totalMinutes).toBe(326);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/unit/analyze-day.test.js`  
Expected: FAIL because `analyzeDay` is missing.

- [ ] **Step 3: Implement coarse scan, refinement, and worker messages**

Worker input:

```js
{ type: 'analyze', requestId, projectSnapshot, areaId, localDate }
```

Worker output:

```js
{ type: 'result', requestId, result: { intervals, totalMinutes, samples } }
```

`createAnalysisClient()` must expose `analyze(payload)` and `dispose()`, resolve only the matching request, and terminate the worker on disposal.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/unit/analyze-day.test.js`  
Expected: PASS.

```powershell
git add src/domain/simulation/analyzeDay.js src/workers tests/unit/analyze-day.test.js
git commit -m "feat: add daily analysis worker"
```

## Milestone 3: Three-dimensional scene and interaction

### Task 8: Build the Three.js scene shell and parameterized meshes

**Files:**
- Create: `src/scene/createScene.js`
- Create: `src/scene/createRenderer.js`
- Create: `src/scene/createCameraRig.js`
- Create: `src/scene/buildingMesh.js`
- Create: `src/scene/syncScene.js`
- Test: `tests/unit/scene-sync.test.js`

- [ ] **Step 1: Write a scene-sync contract test**

```js
import { expect, it, vi } from 'vitest';
import { createSceneSynchronizer } from '../../src/scene/syncScene.js';

it('rebuilds only changed buildings', () => {
  const rebuild = vi.fn();
  const sync = createSceneSynchronizer({ rebuild });
  sync([{ id: 'a', revision: 1 }, { id: 'b', revision: 1 }]);
  sync([{ id: 'a', revision: 2 }, { id: 'b', revision: 1 }]);
  expect(rebuild.mock.calls.at(-1)[0].id).toBe('a');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/unit/scene-sync.test.js`  
Expected: FAIL because the scene synchronizer is missing.

- [ ] **Step 3: Implement scene composition**

Create one `THREE.Group` per building, extrude its footprint to total height, add instanced floor lines, use `OrbitControls`, a perspective camera, a ground plane, hemisphere light, directional sun light, and resize observation. Tag meshes with `userData.entityId`.

- [ ] **Step 4: Run tests, build, and commit**

Run: `npm test -- tests/unit/scene-sync.test.js`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS without Three.js import errors.

```powershell
git add src/scene tests/unit/scene-sync.test.js
git commit -m "feat: render parameterized building scene"
```

### Task 9: Add picking, floor isolation, grids, openings, and sunlight overlays

**Files:**
- Create: `src/scene/picking.js`
- Create: `src/scene/floorMode.js`
- Create: `src/scene/observationOverlay.js`
- Create: `src/scene/openingOverlay.js`
- Create: `src/scene/sunOverlay.js`
- Test: `tests/unit/picking.test.js`

- [ ] **Step 1: Test entity resolution from ray hits**

```js
import { expect, it } from 'vitest';
import { resolvePickedEntity } from '../../src/scene/picking.js';

it('walks to the nearest tagged parent', () => {
  const parent = { userData: { entityId: 'building-a' }, parent: null };
  const child = { userData: {}, parent };
  expect(resolvePickedEntity([{ object: child }])).toBe('building-a');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/unit/picking.test.js`  
Expected: FAIL.

- [ ] **Step 3: Implement scene editing overlays**

Floor mode makes non-selected floors translucent, places a top-down camera preset above the active floor, renders selectable 1 m cells clipped to the footprint, shows opening rectangles on wall planes, draws the sun direction arrow, and colors lit cells warm yellow.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- tests/unit/picking.test.js`  
Expected: PASS.

```powershell
git add src/scene tests/unit/picking.test.js
git commit -m "feat: add scene picking and sunlight overlays"
```

## Milestone 4: Responsive product experience

### Task 10: Implement the responsive application shell

**Files:**
- Create: `src/ui/createElement.js`
- Create: `src/features/shell/AppShell.js`
- Create: `src/features/shell/DesktopShell.js`
- Create: `src/features/shell/MobileShell.js`
- Create: `src/styles/layout.css`
- Create: `src/styles/controls.css`
- Modify: `src/main.js`
- Test: `tests/e2e/responsive-shell.spec.js`

- [ ] **Step 1: Write the desktop/mobile shell test**

```js
import { expect, test } from '@playwright/test';

test('desktop exposes sidebars and mobile exposes bottom navigation', async ({ page }) => {
  await page.goto('/');
  if (test.info().project.name === 'desktop') {
    await expect(page.getByTestId('project-tree')).toBeVisible();
    await expect(page.getByTestId('inspector')).toBeVisible();
  } else {
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    await expect(page.getByTestId('project-tree')).toBeHidden();
  }
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:e2e -- tests/e2e/responsive-shell.spec.js`  
Expected: FAIL because the shell is absent.

- [ ] **Step 3: Implement breakpoint-specific composition**

Use one feature registry and one store. At widths below `768px`, render the canvas with a bottom sheet and four-item navigation; at `768px` and above, render collapsible left and right panels. Do not duplicate feature business logic.

- [ ] **Step 4: Run desktop and mobile tests**

Run: `npm run test:e2e -- tests/e2e/responsive-shell.spec.js`  
Expected: PASS in Chromium desktop and mobile projects.

- [ ] **Step 5: Commit**

```powershell
git add src/features/shell src/ui src/styles src/main.js tests/e2e/responsive-shell.spec.js
git commit -m "feat: add responsive application shell"
```

### Task 11: Build the five-step wizard and building editor

**Files:**
- Create: `src/features/wizard/Wizard.js`
- Create: `src/features/location/LocationEditor.js`
- Create: `src/features/buildings/BuildingEditor.js`
- Create: `src/features/buildings/BuildingList.js`
- Test: `tests/e2e/wizard-building.spec.js`

- [ ] **Step 1: Write the first half of the wizard flow**

```js
import { expect, test } from '@playwright/test';

test('creates and positions two editable buildings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.getByLabel('城市').fill('深圳');
  await page.getByRole('option', { name: '深圳' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '一字型' }).click();
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByRole('button', { name: 'L 型' }).click();
  await expect(page.getByText('建筑 2')).toBeVisible();
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:e2e -- tests/e2e/wizard-building.spec.js`  
Expected: FAIL because wizard controls are absent.

- [ ] **Step 3: Implement location and building commands**

The location editor must support offline city search plus manual latitude, longitude, and IANA time-zone fields. The building editor must expose template-specific dimensions, floors, floor height, optional first-floor height, world `x/z`, rotation, name, duplicate, and delete. Inputs validate on blur and before advancing.

- [ ] **Step 4: Run the test and commit**

Run: `npm run test:e2e -- tests/e2e/wizard-building.spec.js`  
Expected: PASS.

```powershell
git add src/features/wizard src/features/location src/features/buildings tests/e2e/wizard-building.spec.js
git commit -m "feat: add setup wizard and building editor"
```

### Task 12: Build observation-area painting and opening editors

**Files:**
- Create: `src/features/floors/FloorSelector.js`
- Create: `src/features/areas/AreaPainter.js`
- Create: `src/features/areas/AreaInspector.js`
- Create: `src/features/openings/OpeningEditor.js`
- Test: `tests/e2e/area-opening.spec.js`

- [ ] **Step 1: Write the editing flow**

```js
import { expect, test } from '@playwright/test';

test('paints an area and attaches a south-facing window', async ({ page }) => {
  await page.goto('/?fixture=single-bar');
  await page.getByLabel('目标楼层').fill('9');
  await page.getByRole('button', { name: '编辑观察区域' }).click();
  await page.getByTestId('grid-cell-2-1').click();
  await page.getByTestId('grid-cell-2-2').click();
  await expect(page.getByTestId('selected-area')).toContainText('2㎡');
  await page.getByRole('button', { name: '添加普通窗' }).click();
  await page.getByTestId('wall-south-0').click();
  await expect(page.getByTestId('opening-summary')).toContainText('普通窗');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:e2e -- tests/e2e/area-opening.spec.js`  
Expected: FAIL.

- [ ] **Step 3: Implement pointer-safe editing**

Area painting supports click, pointer drag, erase mode, clear, name, and sample height. Opening types are `window`, `floorWindow`, and `balcony`. Opening editing supports wall selection, horizontal offset, width, height, sill height, and type-specific balcony depth/top slab/railing settings. Clamp values to wall and floor bounds and show the exact validation message beside the invalid control.

- [ ] **Step 4: Run test and commit**

Run: `npm run test:e2e -- tests/e2e/area-opening.spec.js`  
Expected: PASS on desktop and mobile projects.

```powershell
git add src/features/floors src/features/areas src/features/openings tests/e2e/area-opening.spec.js
git commit -m "feat: add observation and opening editors"
```

### Task 13: Add time controls, playback, results, and daily analysis

**Files:**
- Create: `src/features/timeline/Timeline.js`
- Create: `src/features/timeline/usePlayback.js`
- Create: `src/features/results/ResultsPanel.js`
- Create: `src/features/results/DirectSunStatus.js`
- Test: `tests/e2e/simulation.spec.js`

- [ ] **Step 1: Write the simulation experience test**

```js
import { expect, test } from '@playwright/test';

test('updates current and daily results when time changes', async ({ page }) => {
  await page.goto('/?fixture=unobstructed-south-window');
  await page.getByLabel('时间').fill('12:00');
  await expect(page.getByTestId('direct-sun-status')).toContainText('有直射');
  await expect(page.getByTestId('solar-altitude')).not.toContainText('--');
  await expect(page.getByTestId('daily-total')).toContainText('小时');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:e2e -- tests/e2e/simulation.spec.js`  
Expected: FAIL.

- [ ] **Step 3: Implement time and result presentation**

Timeline covers daylight hours, marks direct intervals in yellow and blocked intervals in graphite, supports drag, play/pause, `1×/5×/20×`, and sunrise/sunset jumps. Results show location/date/time, angles, direct status, lit ratio, intervals, total duration, and the non-compliance disclaimer.

- [ ] **Step 4: Run test and commit**

Run: `npm run test:e2e -- tests/e2e/simulation.spec.js`  
Expected: PASS.

```powershell
git add src/features/timeline src/features/results tests/e2e/simulation.spec.js
git commit -m "feat: add timeline and sunlight results"
```

### Task 14: Add project files, autosave, screenshot, and recovery

**Files:**
- Create: `src/features/project/exportProject.js`
- Create: `src/features/project/importProject.js`
- Create: `src/features/project/localDraft.js`
- Create: `src/features/project/exportScreenshot.js`
- Create: `src/ui/Toast.js`
- Test: `tests/unit/project-files.test.js`
- Test: `tests/e2e/project-files.spec.js`

- [ ] **Step 1: Test round-trip and invalid-file safety**

```js
import { expect, it } from 'vitest';
import { serializeProject } from '../../src/features/project/exportProject.js';
import { parseProject } from '../../src/features/project/importProject.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';

it('round-trips a valid project', () => {
  const project = createDefaultProject();
  expect(parseProject(serializeProject(project))).toEqual(project);
});

it('rejects invalid JSON without returning partial state', () => {
  expect(() => parseProject('{broken')).toThrow('项目文件不是有效的 JSON');
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/unit/project-files.test.js`  
Expected: FAIL.

- [ ] **Step 3: Implement local project operations**

Export pretty-printed UTF-8 JSON as `<sanitized-name>.sunlight.json`. Parse into a new object, migrate, validate, then replace the store atomically. Explain local drafts on first use, debounce saves by 500 ms, and provide a clear-draft action. Screenshot a renderer frame plus a bottom watermark containing city, date, time, and disclaimer; never include side panels.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/unit/project-files.test.js`  
Expected: PASS.

Run: `npm run test:e2e -- tests/e2e/project-files.spec.js`  
Expected: PASS for export/import and invalid file handling.

```powershell
git add src/features/project src/ui/Toast.js tests
git commit -m "feat: add local project persistence and exports"
```

## Milestone 5: Hardening and release readiness

### Task 15: Add fixtures, accessibility, compatibility, and performance fallbacks

**Files:**
- Create: `tests/fixtures/single-bar.json`
- Create: `tests/fixtures/unobstructed-south-window.json`
- Create: `tests/fixtures/courtyard.json`
- Create: `src/features/compatibility/WebGLFallback.js`
- Create: `src/features/settings/QualitySettings.js`
- Modify: `src/styles/base.css`
- Test: `tests/e2e/accessibility-performance.spec.js`

- [ ] **Step 1: Add failing compatibility and touch-target assertions**

```js
import { expect, test } from '@playwright/test';

test('all primary mobile controls meet the touch target', async ({ page }) => {
  await page.goto('/?fixture=single-bar');
  const controls = page.locator('[data-primary-control]');
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const box = await controls.nth(index).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run test:e2e -- tests/e2e/accessibility-performance.spec.js`  
Expected: FAIL until controls and fallbacks are complete.

- [ ] **Step 3: Implement hardening**

Add WebGL detection before mounting the editor, reduced-motion styles, focus-visible rings, text alternatives for status colors, low/medium/high visual quality, preview quality while dragging, geometry/material reuse, and a ten-building performance fixture.

- [ ] **Step 4: Run full verification**

Run: `npm test`  
Expected: all unit tests PASS.

Run: `npm run test:e2e`  
Expected: desktop and mobile suites PASS.

Run: `npm run build`  
Expected: static build succeeds.

- [ ] **Step 5: Commit**

```powershell
git add src tests
git commit -m "feat: harden accessibility and performance"
```

### Task 16: Document, deploy-check, and prepare the open-source release

**Files:**
- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `public/examples/shenzhen-winter-solstice.sunlight.json`
- Modify: `vercel.json`
- Test: `tests/e2e/example-project.spec.js`

- [ ] **Step 1: Test the bundled example**

```js
import { expect, test } from '@playwright/test';

test('bundled example opens with a valid result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '打开示例项目' }).click();
  await expect(page.getByTestId('active-area-name')).toContainText('客厅');
  await expect(page.getByTestId('daily-total')).not.toContainText('--');
});
```

- [ ] **Step 2: Write user and contributor documentation**

README must include product scope, animated or static preview, local commands, Vercel deployment, project-file format, calculation method, privacy behavior, browser support, and the professional-report disclaimer. CONTRIBUTING must cover issue reproduction, tests, file boundaries, commit style, and how to add a building template. Do not add a LICENSE file until the maintainer chooses one.

- [ ] **Step 3: Run release verification**

Run: `npm ci`  
Expected: clean dependency installation.

Run: `npm test && npm run test:e2e && npm run build`  
Expected: every command succeeds and `dist/` contains the static application.

- [ ] **Step 4: Commit**

```powershell
git add README.md CONTRIBUTING.md public vercel.json tests/e2e/example-project.spec.js
git commit -m "docs: prepare open source release"
```

## Final acceptance pass

- [ ] Create a new project on desktop and complete all five setup steps.
- [ ] Repeat the same flow at a mobile viewport without switching to desktop mode.
- [ ] Verify all three building templates and all three opening types.
- [ ] Confirm adding a blocking building changes the active area result.
- [ ] Confirm JSON export/import restores geometry, date, time, and camera.
- [ ] Confirm screenshot contains the required watermark and excludes panels.
- [ ] Confirm invalid files and no-WebGL environments preserve user data and show clear guidance.
- [ ] Confirm the UI states that results are for purchase reference and not a professional compliance report.
- [ ] Run `npm test`, `npm run test:e2e`, and `npm run build` from a clean checkout.



