# 编辑/展示 分裂与信息架构 Implementation Plan (Phase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the app into 编辑 (edit) and 展示 (present) phases, restructure the left sidebar into a building→area tree, remove area naming, and add a lightweight location picker — without touching the sunlight algorithm or the interior view (those are Phase B/C).

**Architecture:** Add a top-level `view.phase: 'edit' | 'present'` field above the existing `editorMode`. Phase gates UI (timeline, results, inspector) and scene lighting (neutral in edit, solar-driven in present). The left `createProjectTree` becomes a hierarchy with per-building "＋ 观察区"; the right `createAreaFloorTool` is stripped to a session-only params view (no home list, no name). Area `name` is removed from the data model; labels are derived as `观察区 {index+1}`.

**Tech Stack:** Vite + vanilla JS, Three.js, Vitest (jsdom), Playwright. No new dependencies.

## Global Constraints

- Node >= 22.12. Pure static frontend, no backend, no new framework/dependency.
- UI copy is Chinese-first, reads naturally to non-technical end users.
- New interactions must support mouse, keyboard, and touch.
- One commit per concern. Before committing: `npm test`, `npm run test:e2e` (or `--list` if no browsers), `npm run build` all pass.
- Do not change sunlight algorithms (`evaluateDirectSun`, `analyzeDay`, `intersectOpening`, etc.).
- Do not wire the daily-analysis worker.
- Area data model loses `name`: `{ id, floor, rects, sampleHeight }`.
- `view.phase` is the single source of truth for phase; all consumers derive from it.

## File Structure

**Create:**
- `src/features/location/createLocationPicker.js` — lightweight city `<select>` + custom lat/lon; dispatches `createSetLocationCommand`.
- `tests/unit/location-picker.test.js` — its tests.

**Modify:**
- `src/domain/project/defaultProject.js` — add `view.phase: 'edit'`.
- `src/domain/project/migrateProject.js` — set `view.phase='edit'`, `delete area.name`.
- `src/domain/buildings/areaEditing.js` — drop `name` from session; add `areaLabel(area, index)`.
- `src/store/buildingCommands.js` — add `createSetPhaseCommand`, `createSetLocationCommand`; drop `name` from area save/start-edit/update.
- `src/features/results/createSimulationController.js` — derive area labels in `collectAreas`.
- `src/scene/sunLighting.js` — accept `{ phase }`, neutral light in edit.
- `src/scene/createSceneController.js` — `updateSolar` passes phase to `applySunLighting`.
- `src/features/areas/createAreaFloorTool.js` — strip home/name; session-only.
- `src/features/shell/DesktopShell.js` — `createProjectTree` hierarchy + per-building "＋ 观察区".
- `src/features/buildings/BuildingOverview.js` — repoint areas button to start create; disable in present.
- `src/features/shell/AppShell.js` — header 编辑/展示 toggle; phase-gated inspector/timeline; mount location picker.
- `src/features/shell/MobileShell.js` — phase-gated tabs.
- `src/main.js` — phase-aware solar/analysis forwarding; screenshot watermark uses `location.label`.
- Tests: `migrate-project.test.js`, `building-commands.test.js`, `simulation-controller.test.js`, `sun-lighting.test.js`, `area-floor-tool.test.js`, `building-overview.test.js`, `app-shell.test.js`; e2e `area-topdown.spec.js`, `edit-modes.spec.js`, `simulation.spec.js` as needed.

**Delete:**
- `src/features/location/LocationEditor.js` (dead code, replaced).
- `src/features/floors/FloorSelector.js` (dead code).

---

### Task 1: `view.phase` default + migration (drop `area.name`, set phase)

**Files:**
- Modify: `src/domain/project/defaultProject.js:21-29`
- Modify: `src/domain/project/migrateProject.js:10-21`
- Test: `tests/unit/migrate-project.test.js`

**Interfaces:**
- Produces: `project.view.phase` (`'edit'` by default); migrated areas have no `name`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/migrate-project.test.js` (and adjust the first test which currently asserts `area.name === '客厅'`):

```js
describe('migrateProject phase and name cleanup', () => {
  it('drops legacy area.name and ensures view.phase is edit', () => {
    const raw = {
      schemaVersion: 1,
      buildings: [{
        id: 'b1',
        observationAreas: [{ id: 'a1', name: '客厅', floor: 1, rects: [] }]
      }],
      view: { selectedBuildingId: null, editorMode: 'none' }
    };
    const out = migrateProject(raw);
    expect(out.buildings[0].observationAreas[0].name).toBeUndefined();
    expect(out.view.phase).toBe('edit');
  });

  it('preserves an explicit present phase', () => {
    const out = migrateProject({ schemaVersion: 1, buildings: [], view: { phase: 'present' } });
    expect(out.view.phase).toBe('present');
  });
});
```

Also update the existing first test (`drops legacy cells/openingIds and ensures rects`) — change the final assertion from `expect(area.name).toBe('客厅')` to `expect(area.name).toBeUndefined()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/migrate-project.test.js`
Expected: FAIL — `view.phase` undefined; `area.name` still present.

- [ ] **Step 3: Implement**

`src/domain/project/defaultProject.js` — add `phase: 'edit'` to `view`:

```js
    view: {
      camera: null,
      activePanel: 'buildings',
      wizardComplete: false,
      phase: 'edit',
      selectedBuildingId: null,
      editorMode: 'none',
      addingBuildingId: null,
      areaEditing: null
    }
```

`src/domain/project/migrateProject.js` — drop `area.name` and normalize `view.phase`:

```js
  const project = structuredClone(rawProject);
  for (const building of project.buildings ?? []) {
    for (const area of building.observationAreas ?? []) {
      delete area.cells;
      delete area.openingIds;
      delete area.name;
      if (!Array.isArray(area.rects)) area.rects = [];
    }
  }
  const view = project.view ?? (project.view = {});
  view.areaEditing = null;
  if (view.phase !== 'present') view.phase = 'edit';
  delete view.areaDraft;
  delete view.areaTool;
  return project;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/migrate-project.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/project/defaultProject.js src/domain/project/migrateProject.js tests/unit/migrate-project.test.js
git commit -m "feat(project): add view.phase, drop area.name in migration"
```

---

### Task 2: Phase/location commands + remove `name` from area commands + `areaLabel`

**Files:**
- Modify: `src/domain/buildings/areaEditing.js`
- Modify: `src/store/buildingCommands.js:292-373`
- Test: `tests/unit/building-commands.test.js`

**Interfaces:**
- Produces: `createSetPhaseCommand(phase)`, `createSetLocationCommand(location)`, `areaLabel(area, index)`.
- Produces: `createAreaEditingSession` no longer sets `name`; `createSaveAreaEditingCommand` writes areas without `name`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/building-commands.test.js` (add imports `createSetPhaseCommand`, `createSetLocationCommand` to the existing import block; add `areaLabel` import from `areaEditing.js`):

```js
describe('phase and location commands', () => {
  it('sets the phase and ignores invalid values', () => {
    const store = createStore(createDefaultProject());
    store.execute(createSetPhaseCommand('present'));
    expect(store.getState().view.phase).toBe('present');
    store.execute(createSetPhaseCommand('nonsense'));
    expect(store.getState().view.phase).toBe('present');
  });

  it('sets the project location', () => {
    const store = createStore(createDefaultProject());
    const loc = { cityId: 'beijing', label: '北京', latitude: 39.9042, longitude: 116.4074, timeZone: 'Asia/Shanghai' };
    store.execute(createSetLocationCommand(loc));
    expect(store.getState().location).toEqual(loc);
  });
});

describe('area label derivation', () => {
  it('derives a 1-based label independent of any stored name', () => {
    expect(areaLabel({ id: 'a1' }, 0)).toBe('观察区 1');
    expect(areaLabel({ id: 'a2' }, 2)).toBe('观察区 3');
  });
});
```

Then update the existing area-command assertions that reference `name`. In the `createStartAreaCreateCommand` test (~line 427), change the `toMatchObject` to:

```js
    expect(next.view.areaEditing).toMatchObject({ mode: 'create', buildingId: 'b1', areaId: null, floor: 1, rects: [], tool: 'draw' });
    expect(next.view.areaEditing.name).toBeUndefined();
```

In the `createStartAreaEditCommand` test (~line 433), remove `name: '客厅'` from the expected object and add `expect(next.view.areaEditing.name).toBeUndefined();`.

In the update-editing test (~line 441), change `{ floor: 3, name: '卧室', rects: [...] }` patch to `{ floor: 3, rects: [...] }` and expect `toMatchObject({ floor: 3 })` plus `expect(next.view.areaEditing.name).toBeUndefined()`.

In the save-create test (~line 453-457), change the patch to drop `name`, and change the final `toMatchObject` to:

```js
    expect(next.buildings[0].observationAreas[1]).toMatchObject({ floor: 3, rects: [{ x0: 1, z0: 1, x1: 2, z1: 2 }], sampleHeight: 0 });
    expect(next.buildings[0].observationAreas[1].name).toBeUndefined();
```

In the save-edit test (~line 462-465), drop `name` from the patch and from the `toMatchObject`, and add `expect(next.buildings[0].observationAreas[0].name).toBeUndefined()`.

Also update the `base` fixtures in these tests (~lines 420, 475) that define `observationAreas: [{ id: 'a1', name: '客厅', ... }]` — remove `name: '客厅',` from them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/building-commands.test.js`
Expected: FAIL — commands/helpers not exported; `name` assertions fail.

- [ ] **Step 3: Implement**

`src/domain/buildings/areaEditing.js` — drop `name`, add `areaLabel`:

```js
export function cloneRects(rects = []) {
  return rects.map(r => ({ ...r }));
}

export function createAreaEditingSession({ mode, buildingId, area = null, defaults = {} }) {
  return {
    mode,
    buildingId,
    areaId: mode === 'edit' ? area?.id : null,
    floor: area?.floor ?? defaults.floor ?? 1,
    rects: cloneRects(area?.rects ?? defaults.rects ?? []),
    sampleHeight: area?.sampleHeight ?? defaults.sampleHeight ?? 0,
    tool: defaults.tool ?? 'draw'
  };
}

export function rectArea(rects = []) {
  return rects.reduce((sum, r) => sum + Math.abs((r.x1 - r.x0) * (r.z1 - r.z0)), 0);
}

export function areaLabel(_area, index) {
  return `观察区 ${index + 1}`;
}
```

`src/store/buildingCommands.js` — add the two commands near `createSetEditorModeCommand`, and rewrite the save command to drop `name`. Add at top near `EDITOR_MODES`:

```js
const PHASES = new Set(['edit', 'present']);
```

Add after `createSetEditorModeCommand`:

```js
export function createSetPhaseCommand(phase) {
  return {
    label: '切换环节',
    apply(state) {
      if (!PHASES.has(phase)) return state;
      return { ...state, view: { ...state.view, phase } };
    }
  };
}

export function createSetLocationCommand(location) {
  return {
    label: '修改项目位置',
    apply(state) {
      return { ...state, location: structuredClone(location) };
    }
  };
}
```

Rewrite `createSaveAreaEditingCommand` (replace lines 347-373) — remove the `name` line:

```js
export function createSaveAreaEditingCommand() {
  return {
    label: '保存观察区',
    apply(state) {
      const editing = state.view.areaEditing;
      if (!editing || editing.rects.length === 0) return state;
      const areaId = editing.mode === 'edit'
        ? editing.areaId
        : (globalThis.crypto?.randomUUID?.() ?? `area-${Date.now()}`);
      const area = { id: areaId, floor: editing.floor, rects: editing.rects, sampleHeight: editing.sampleHeight ?? 0 };
      return {
        ...state,
        buildings: state.buildings.map(b => b.id !== editing.buildingId ? b : {
          ...b,
          revision: (b.revision ?? 0) + 1,
          observationAreas: editing.mode === 'edit'
            ? b.observationAreas.map(a => a.id !== editing.areaId ? a : { ...a, ...area })
            : [...b.observationAreas, area]
        }),
        simulation: { ...state.simulation, activeAreaId: areaId },
        view: { ...state.view, areaEditing: null }
      };
    }
  };
}
```

(`createStartAreaCreateCommand` / `createStartAreaEditCommand` need no change — they delegate to `createAreaEditingSession`, which no longer sets `name`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/building-commands.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/buildings/areaEditing.js src/store/buildingCommands.js tests/unit/building-commands.test.js
git commit -m "feat(commands): add setPhase/setLocation, drop area name"
```

---

### Task 3: Simulation controller — derive area labels

**Files:**
- Modify: `src/features/results/createSimulationController.js:18-28`
- Test: `tests/unit/simulation-controller.test.js`

**Interfaces:**
- Produces: `state.areaOptions` items are `{ id, name }` where `name` is the derived label `观察区 {index+1}` (per building, 1-based).

- [ ] **Step 1: Write the failing test**

In `tests/unit/simulation-controller.test.js`, update the `lists all observation areas as options` test (~line 165). The fixture `projectWithSouthWindow` area has `name: '客厅'` — remove `name: '客厅',` from that fixture (~line 23). Then update the assertion:

```js
  it('lists all observation areas as options and switches active area', () => {
    const store = createStore(projectWithSouthWindow());
    const controller = createSimulationController(store);
    expect(controller.getState().areaOptions).toEqual([{ id: 'area-a', name: '观察区 1' }]);
    controller.setActiveArea('area-a');
    expect(store.getState().simulation.activeAreaId).toBe('area-a');
  });
```

Also remove `name: '客厅',` from the fixture in the `loses direct sun` / `reports direct sun` fixtures if present (the `projectWithSouthWindow` fixture is shared — one edit covers all).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/simulation-controller.test.js`
Expected: FAIL — `areaOptions` still `{ id: 'area-a', name: '客厅' }` (or undefined name).

- [ ] **Step 3: Implement**

`src/features/results/createSimulationController.js` — import `areaLabel` and use index in `collectAreas`:

```js
import { areaLabel } from '../../domain/buildings/areaEditing.js';
```

Replace `collectAreas`:

```js
function collectAreas(project) {
  const options = [];
  const map = new Map();
  for (const building of project.buildings) {
    (building.observationAreas ?? []).forEach((area, index) => {
      options.push({ id: area.id, name: areaLabel(area, index) });
      map.set(area.id, { building, area });
    });
  }
  return { options, map };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/simulation-controller.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/results/createSimulationController.js tests/unit/simulation-controller.test.js
git commit -m "feat(results): derive observation area labels"
```

---

### Task 4: `applySunLighting` neutral edit-phase light

**Files:**
- Modify: `src/scene/sunLighting.js`
- Modify: `src/scene/createSceneController.js:156-158`
- Test: `tests/unit/sun-lighting.test.js`

**Interfaces:**
- Produces: `applySunLighting(light, solar, { phase = 'present' } = {})` — `phase==='edit'` sets a fixed neutral non-shadow-casting light.
- Produces: `sceneController.updateSolar(simulationState, phase)`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/sun-lighting.test.js`:

```js
  it('uses a neutral non-shadow light in edit phase regardless of solar', () => {
    const light = new THREE.DirectionalLight();
    applySunLighting(light, { aboveHorizon: true, altitudeDeg: 60, direction: { x: 1, y: 0.5, z: 0 } }, { phase: 'edit' });
    expect(light.visible).toBe(true);
    expect(light.castShadow).toBe(false);
    expect(light.intensity).toBeGreaterThan(0);
    expect(light.position.x).toBe(60);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sun-lighting.test.js`
Expected: FAIL — third argument ignored; `castShadow` true.

- [ ] **Step 3: Implement**

`src/scene/sunLighting.js`:

```js
const SUN_DISTANCE = 180;

export function applySunLighting(light, solar, { phase = 'present' } = {}) {
  if (phase === 'edit') {
    light.visible = true;
    light.castShadow = false;
    light.intensity = 2.4;
    light.position.set(60, 120, 40);
    light.target.position.set(0, 0, 0);
    light.target.updateMatrixWorld();
    return;
  }
  if (!solar.aboveHorizon) {
    light.visible = false;
    light.castShadow = false;
    return;
  }
  const { x, y, z } = solar.direction;
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  light.visible = true;
  light.castShadow = true;
  light.intensity = 3.2;
  light.position.set(
    (x / len) * SUN_DISTANCE,
    (y / len) * SUN_DISTANCE,
    (z / len) * SUN_DISTANCE
  );
  light.target.position.set(0, 0, 0);
  light.target.updateMatrixWorld();
  light.shadow.needsUpdate = true;
}
```

`src/scene/createSceneController.js` — update `updateSolar` (~line 156):

```js
    updateSolar(simulationState, phase = 'present') {
      applySunLighting(sceneParts.sunlight, simulationState.solar, { phase });
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/sun-lighting.test.js`
Expected: PASS. Also run `npx vitest run tests/unit/scene-sync.test.js` to ensure no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/scene/sunLighting.js src/scene/createSceneController.js tests/unit/sun-lighting.test.js
git commit -m "feat(scene): neutral lighting in edit phase"
```

---

### Task 5: `createAreaFloorTool` — strip home/name, session-only

**Files:**
- Modify: `src/features/areas/createAreaFloorTool.js`
- Test: `tests/unit/area-floor-tool.test.js`

**Interfaces:**
- Consumes: `view.areaEditing` (always set when `editorMode==='areas'`, driven by the tree).
- Produces: a session-only panel (floor input, draw/erase tools, rect summary, save/cancel, back). No home view, no name input, no create-start button, no cards.

- [ ] **Step 1: Rewrite the tests**

Replace `tests/unit/area-floor-tool.test.js` contents with:

```js
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createAreaFloorTool } from '../../src/features/areas/createAreaFloorTool.js';

function building() {
  return {
    id: 'b1', name: '1号楼', params: { floors: 5 },
    observationAreas: [{ id: 'a1', floor: 1, rects: [] }]
  };
}

function fakeStore(state = {}) {
  const defaults = { view: { areaEditing: null }, ...state };
  if (state.view) defaults.view = { areaEditing: null, ...state.view };
  return { execute: vi.fn(), getState: () => defaults };
}

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

function session(over = {}) {
  return { mode: 'create', buildingId: 'b1', areaId: null, floor: 1, rects: [], tool: 'draw', ...over };
}

describe('createAreaFloorTool (session-only)', () => {
  it('has no home view, name input, or create-start button', () => {
    const store = fakeStore({ view: { areaEditing: session() } });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'area-home')).toBeNull();
    expect(q(element, 'area-create-start')).toBeNull();
    expect(q(element, 'area-session')).not.toBeNull();
    expect(element.querySelector('input[aria-label="区域名称"]')).toBeNull();
  });

  it('renders create session with disabled save until rects exist', () => {
    const store = fakeStore({ view: { areaEditing: session() } });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'area-session-title').textContent).toContain('新建观察区');
    expect(q(element, 'area-save').disabled).toBe(true);
  });

  it('dispatches save and cancel commands in an edit session', () => {
    const store = fakeStore({
      view: { areaEditing: session({ mode: 'edit', areaId: 'a1', floor: 2, rects: [{ x0: 0, z0: 0, x1: 2, z1: 2 }] }) }
    });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    expect(q(element, 'area-session-title').textContent).toContain('编辑观察区');
    q(element, 'area-save').click();
    expect(store.execute.mock.calls.at(-1)[0].label).toBe('保存观察区');
    q(element, 'area-cancel').click();
    expect(store.execute.mock.calls.at(-1)[0].label).toBe('取消观察区编辑');
  });

  it('hides erase in create mode, shows it for non-empty edit sessions', () => {
    const createStore = fakeStore({ view: { areaEditing: session() } });
    const createTool = createAreaFloorTool({ store: createStore, buildingId: 'b1' });
    createTool.update(building());
    expect(q(createTool.element, 'tool-erase').hidden).toBe(true);

    const editStore = fakeStore({
      view: { areaEditing: session({ mode: 'edit', areaId: 'a1', floor: 2, rects: [{ x0: 0, z0: 0, x1: 2, z1: 2 }] }) }
    });
    const editTool = createAreaFloorTool({ store: editStore, buildingId: 'b1' });
    editTool.update(building());
    expect(q(editTool.element, 'tool-erase').hidden).toBe(false);
  });

  it('back button cancels an active session before leaving', () => {
    const store = fakeStore({ view: { areaEditing: session() } });
    const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
    update(building());
    q(element, 'inspector-back').click();
    const labels = store.execute.mock.calls.map(c => c[0].label);
    expect(labels).toContain('取消观察区编辑');
    expect(labels).toContain('切换编辑模式');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/area-floor-tool.test.js`
Expected: FAIL — old component still renders home/name.

- [ ] **Step 3: Implement**

Replace `src/features/areas/createAreaFloorTool.js` with a session-only version:

```js
import { createElement } from '../../ui/createElement.js';
import { rectArea } from '../../domain/buildings/areaEditing.js';
import {
  createCancelAreaEditingCommand,
  createSaveAreaEditingCommand,
  createSetEditorModeCommand,
  createUpdateAreaEditingCommand
} from '../../store/buildingCommands.js';

const TOOLS = [['draw', '画区'], ['erase', '擦除']];

export function createAreaFloorTool({ store, buildingId }) {
  let currentBuilding = null;

  const element = createElement('div', { className: 'area-floor-tool' });

  const back = createElement('button', {
    className: 'button button--ghost', text: '‹ 返回', testId: 'inspector-back',
    attributes: { type: 'button' }
  });
  back.addEventListener('click', () => {
    const session = store.getState()?.view?.areaEditing;
    if (session && session.buildingId === buildingId) {
      store.execute(createCancelAreaEditingCommand());
    }
    store.execute(createSetEditorModeCommand('none'));
  });

  const floorInput = createElement('input', {
    className: 'input', testId: 'area-floor',
    attributes: { type: 'number', min: '1', 'aria-label': '楼层' }
  });
  floorInput.addEventListener('change', () => {
    if (!currentBuilding) return;
    const maxFloor = currentBuilding.params.floors;
    const floor = Math.max(1, Math.min(maxFloor, Math.round(Number(floorInput.value) || 1)));
    floorInput.value = String(floor);
    store.execute(createUpdateAreaEditingCommand({ floor }));
  });

  const toolButtons = new Map();
  const toolBar = createElement('div', { className: 'template-picker area-tool-buttons' });
  for (const [tool, label] of TOOLS) {
    const btn = createElement('button', {
      className: 'template-card', text: label, testId: `tool-${tool}`,
      attributes: { type: 'button', 'aria-pressed': 'false' }
    });
    btn.addEventListener('click', () => store.execute(createUpdateAreaEditingCommand({ tool })));
    toolButtons.set(tool, btn);
    toolBar.append(btn);
  }

  function applyToolUI(tool) {
    element.dataset.tool = tool;
    for (const [t, btn] of toolButtons) {
      btn.setAttribute('aria-pressed', String(t === tool));
      btn.classList.toggle('is-active', t === tool);
    }
  }

  const rectSummary = createElement('span', { className: 'area-rect-summary', testId: 'area-rect-summary' });
  const saveBtn = createElement('button', {
    className: 'button button--primary', text: '保存', testId: 'area-save',
    attributes: { type: 'button' }
  });
  saveBtn.addEventListener('click', () => store.execute(createSaveAreaEditingCommand()));
  const cancelBtn = createElement('button', {
    className: 'button button--ghost', text: '取消', testId: 'area-cancel',
    attributes: { type: 'button' }
  });
  cancelBtn.addEventListener('click', () => store.execute(createCancelAreaEditingCommand()));

  const sessionLabel = createElement('div', { className: 'panel__label', text: '新建观察区', testId: 'area-session-title' });
  const sessionTitle = createElement('h2', { className: 'panel__title', text: '建筑' });
  const floorField = createElement('label', { className: 'field' },
    createElement('span', { className: 'field__label', text: '所在楼层' }), floorInput);

  const sessionView = createElement('div', {},
    sessionLabel,
    sessionTitle,
    createElement('div', { className: 'area-session', testId: 'area-session' },
      floorField, toolBar, rectSummary),
    createElement('div', { className: 'inspector-actions' }, cancelBtn, saveBtn)
  );

  element.append(back, sessionView);

  function renderSession(building, session) {
    sessionLabel.textContent = session.mode === 'edit' ? '编辑观察区' : '新建观察区';
    sessionTitle.textContent = building.name ?? '建筑';
    if (document.activeElement !== floorInput) floorInput.value = String(session.floor ?? 1);
    floorInput.setAttribute('max', String(building.params.floors));
    applyToolUI(session.tool ?? 'draw');
    const size = rectArea(session.rects).toFixed(1);
    rectSummary.textContent = session.rects.length > 0
      ? `已绘制 ${session.rects.length} 块，共 ${size} m²`
      : '在画面中拖拽画出观察区';
    saveBtn.disabled = session.rects.length === 0;
    const eraseBtn = toolButtons.get('erase');
    if (eraseBtn) eraseBtn.hidden = !(session.mode === 'edit' && session.rects.length > 0);
  }

  function sync() {
    if (!currentBuilding) return;
    const state = store.getState();
    const session = state?.view?.areaEditing;
    const sessionActive = !!(session && session.buildingId === buildingId);
    sessionView.hidden = !sessionActive;
    if (sessionActive) renderSession(currentBuilding, session);
  }

  return {
    element,
    update(building) {
      currentBuilding = building;
      sync();
    }
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/area-floor-tool.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/areas/createAreaFloorTool.js tests/unit/area-floor-tool.test.js
git commit -m "refactor(areas): strip area tool to session-only, drop name"
```

---

### Task 6: `createProjectTree` — building→area hierarchy

**Files:**
- Modify: `src/features/shell/DesktopShell.js`
- Test: `tests/unit/app-shell.test.js` (add a focused tree test block; or create `tests/unit/project-tree.test.js`)

**Interfaces:**
- Consumes: `store`, `onAdd` (add building). Dispatches `createSelectBuildingCommand`, `createStartAreaCreateCommand`, `createStartAreaEditCommand` directly.
- Produces: a tree with `testId="building-tree-<id>"` rows, each with a `testId="building-add-area-<id>"` button, and `testId="area-tree-<areaId>"` child rows. Add buttons are `disabled` when `view.phase==='present'`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/project-tree.test.js`:

```js
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/store/createStore.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createProjectTree } from '../../src/features/shell/DesktopShell.js';
import { createAddBuildingCommand } from '../../src/store/buildingCommands.js';

function mount(state = {}) {
  const store = createStore({ ...createDefaultProject(), ...state });
  const onAdd = vi.fn();
  const tree = createProjectTree({ store, onAdd });
  document.body.append(tree);
  return { store, tree, onAdd };
}

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('createProjectTree hierarchy', () => {
  it('renders buildings with a per-building add-area button', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(q(tree, 'building-tree-b1')).not.toBeNull();
    expect(q(tree, 'building-add-area-b1')).not.toBeNull();
  });

  it('renders observation areas as children', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    const state = store.getState();
    state.buildings[0].observationAreas.push({ id: 'a1', floor: 2, rects: [] });
    store.setView({}); // trigger re-render
    expect(q(tree, 'area-tree-a1')).not.toBeNull();
    expect(q(tree, 'area-tree-a1').textContent).toContain('观察区 1');
  });

  it('starts an area create session from the building add-area button', () => {
    const { store, tree } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    q(tree, 'building-add-area-b1').click();
    const last = store.getState().view.areaEditing;
    expect(last).toMatchObject({ mode: 'create', buildingId: 'b1' });
  });

  it('disables add buttons in present phase', () => {
    const { store, tree } = mount({ view: { ...createDefaultProject().view, phase: 'present' } });
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    expect(q(tree, 'building-add-area-b1').disabled).toBe(true);
  });
});
```

Note: `createStore.setView` triggers a notify (it calls `setState`), so the tree re-renders. If the mutation-via-direct-push approach is awkward, instead drive area creation through `createStartAreaCreateCommand` + `createSaveAreaEditingCommand` — but the direct-push + `setView({})` is sufficient for the assertion.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/project-tree.test.js`
Expected: FAIL — `building-add-area-b1` / `area-tree-a1` not found.

- [ ] **Step 3: Implement**

Replace `src/features/shell/DesktopShell.js` `createProjectTree`:

```js
import {
  createSelectBuildingCommand,
  createStartAreaCreateCommand,
  createStartAreaEditCommand
} from '../../store/buildingCommands.js';
import { createElement } from '../../ui/createElement.js';
import { areaLabel } from '../../domain/buildings/areaEditing.js';

export function createProjectTree({ store, onAdd }) {
  const list = createElement('div', { className: 'tree-list' });
  const add = createElement('button', {
    className: 'button button--primary panel__action',
    text: '＋ 添加建筑',
    attributes: { type: 'button', 'data-action': 'add-building', 'data-primary-control': '' }
  });
  add.addEventListener('click', onAdd);

  const element = createElement(
    'aside',
    { className: 'project-tree panel', testId: 'project-tree' },
    createElement('div', { className: 'panel__label', text: '场景结构' }),
    createElement('h2', { className: 'panel__title', text: '场景对象' }),
    add,
    list
  );

  function render(project) {
    const locked = project.view.phase === 'present';
    add.disabled = locked;

    if (project.buildings.length === 0) {
      list.replaceChildren(createElement('p', {
        className: 'tree-empty',
        text: '暂无建筑。添加后可在这里选择和编辑。'
      }));
      return;
    }

    const nodes = project.buildings.map(building => {
      const selected = building.id === project.view.selectedBuildingId;
      const header = createElement('div', { className: 'tree-row tree-row--building' },
        createElement('button', {
          className: `tree-row__label ${selected ? 'is-active' : ''}`,
          text: `▾ ${building.name}`,
          testId: `building-tree-${building.id}`,
          attributes: { type: 'button' }
        }),
        createElement('button', {
          className: 'button button--ghost tree-row__add',
          text: '＋ 观察区',
          testId: `building-add-area-${building.id}`,
          attributes: { type: 'button', disabled: locked }
        })
      );
      header.querySelector('.tree-row__label').addEventListener('click', () => {
        store.execute(createSelectBuildingCommand(building.id));
      });
      header.querySelector('.tree-row__add').addEventListener('click', () => {
        if (locked) return;
        store.execute(createStartAreaCreateCommand(building.id));
      });

      const children = (building.observationAreas ?? []).map((area, index) => {
        const row = createElement('button', {
          className: 'tree-row tree-row--area',
          text: `${areaLabel(area, index)} · ${area.floor} 层`,
          testId: `area-tree-${area.id}`,
          attributes: { type: 'button' }
        });
        row.addEventListener('click', () => {
          if (locked) {
            store.execute(createSelectBuildingCommand(building.id));
          } else {
            store.execute(createStartAreaEditCommand(building.id, area.id));
          }
        });
        return row;
      });

      return createElement('div', { className: 'tree-node' }, header, ...children);
    });

    list.replaceChildren(...nodes);
  }

  store.subscribe(render);
  render(store.getState());
  return element;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/project-tree.test.js tests/unit/app-shell.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell/DesktopShell.js tests/unit/project-tree.test.js
git commit -m "feat(shell): building->area hierarchy tree with add-area"
```

---

### Task 7: `createLocationPicker` — lightweight city selector

**Files:**
- Create: `src/features/location/createLocationPicker.js`
- Create: `tests/unit/location-picker.test.js`

**Interfaces:**
- Produces: `createLocationPicker({ store })` returning `{ element, update(project) }`. Dispatches `createSetLocationCommand` on change. `element` has `testId="location-picker"` with a `<select testId="location-city">` and a collapsible custom coordinate block (`testId="location-custom"`).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/location-picker.test.js`:

```js
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createLocationPicker } from '../../src/features/location/createLocationPicker.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';

const q = (el, id) => el.querySelector(`[data-testid="${id}"]`);

describe('createLocationPicker', () => {
  it('dispatches a preset city location on select', () => {
    const store = { execute: vi.fn(), getState: () => createDefaultProject() };
    const { element, update } = createLocationPicker({ store });
    update(createDefaultProject());
    const select = q(element, 'location-city');
    select.value = 'beijing';
    select.dispatchEvent(new Event('change'));
    const cmd = store.execute.mock.calls.at(-1)[0];
    expect(cmd.label).toBe('修改项目位置');
    const loc = cmd.apply(createDefaultProject()).location;
    expect(loc.cityId).toBe('beijing');
    expect(loc.label).toBe('北京');
    expect(loc.latitude).toBeCloseTo(39.9042);
    expect(loc.timeZone).toBe('Asia/Shanghai');
  });

  it('reflects the current cityId', () => {
    const project = createDefaultProject();
    project.location = { cityId: 'shanghai', label: '上海', latitude: 31.2304, longitude: 121.4737, timeZone: 'Asia/Shanghai' };
    const store = { execute: vi.fn(), getState: () => project };
    const { element, update } = createLocationPicker({ store });
    update(project);
    expect(q(element, 'location-city').value).toBe('shanghai');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/location-picker.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/location/createLocationPicker.js`:

```js
import { createElement } from '../../ui/createElement.js';
import { createSetLocationCommand } from '../../store/buildingCommands.js';

const PRESET_CITIES = [
  { cityId: 'beijing', label: '北京', latitude: 39.9042, longitude: 116.4074, timeZone: 'Asia/Shanghai' },
  { cityId: 'shanghai', label: '上海', latitude: 31.2304, longitude: 121.4737, timeZone: 'Asia/Shanghai' },
  { cityId: 'guangzhou', label: '广州', latitude: 23.1291, longitude: 113.2644, timeZone: 'Asia/Shanghai' },
  { cityId: 'shenzhen', label: '深圳', latitude: 22.5431, longitude: 114.0579, timeZone: 'Asia/Shanghai' },
  { cityId: 'chengdu', label: '成都', latitude: 30.5728, longitude: 104.0668, timeZone: 'Asia/Shanghai' },
  { cityId: 'hangzhou', label: '杭州', latitude: 30.2741, longitude: 120.1551, timeZone: 'Asia/Shanghai' },
  { cityId: 'chongqing', label: '重庆', latitude: 29.4316, longitude: 106.9123, timeZone: 'Asia/Shanghai' },
  { cityId: 'wuhan', label: '武汉', latitude: 30.5928, longitude: 114.3055, timeZone: 'Asia/Shanghai' },
  { cityId: 'xian', label: '西安', latitude: 34.3416, longitude: 108.9398, timeZone: 'Asia/Shanghai' },
  { cityId: 'nanjing', label: '南京', latitude: 32.0603, longitude: 118.7969, timeZone: 'Asia/Shanghai' },
  { cityId: 'harbin', label: '哈尔滨', latitude: 45.8038, longitude: 126.5349, timeZone: 'Asia/Shanghai' },
  { cityId: 'custom', label: '自定义坐标', latitude: 0, longitude: 0, timeZone: 'Asia/Shanghai' }
];

export function createLocationPicker({ store }) {
  const citySelect = createElement('select', {
    className: 'input', testId: 'location-city',
    attributes: { 'aria-label': '城市' }
  });
  for (const city of PRESET_CITIES) {
    const opt = createElement('option', { text: city.label, attributes: { value: city.cityId } });
    citySelect.append(opt);
  }

  const latInput = createElement('input', {
    className: 'input', testId: 'location-lat',
    attributes: { type: 'number', step: '0.0001', 'aria-label': '纬度' }
  });
  const lonInput = createElement('input', {
    className: 'input', testId: 'location-lon',
    attributes: { type: 'number', step: '0.0001', 'aria-label': '经度' }
  });

  function commit(cityId, lat, lon) {
    const preset = PRESET_CITIES.find(c => c.cityId === cityId) ?? PRESET_CITIES.find(c => c.cityId === 'custom');
    store.execute(createSetLocationCommand({
      cityId,
      label: preset.label,
      latitude: Number(lat),
      longitude: Number(lon),
      timeZone: preset.timeZone
    }));
  }

  citySelect.addEventListener('change', () => {
    const preset = PRESET_CITIES.find(c => c.cityId === citySelect.value);
    if (citySelect.value === 'custom') {
      latInput.hidden = false;
      lonInput.hidden = false;
      return;
    }
    latInput.hidden = true;
    lonInput.hidden = true;
    commit(citySelect.value, preset.latitude, preset.longitude);
  });

  function onCustomChange() {
    if (citySelect.value !== 'custom') return;
    commit('custom', latInput.value || 0, lonInput.value || 0);
  }
  latInput.addEventListener('change', onCustomChange);
  lonInput.addEventListener('change', onCustomChange);

  const element = createElement('div', { className: 'location-picker field', testId: 'location-picker' },
    createElement('span', { className: 'field__label', text: '地点' }),
    citySelect,
    latInput,
    lonInput
  );

  function update(project) {
    const loc = project.location ?? {};
    const known = PRESET_CITIES.some(c => c.cityId === loc.cityId);
    citySelect.value = known ? loc.cityId : 'custom';
    const custom = citySelect.value === 'custom';
    latInput.hidden = !custom;
    lonInput.hidden = !custom;
    if (document.activeElement !== latInput) latInput.value = String(loc.latitude ?? 0);
    if (document.activeElement !== lonInput) lonInput.value = String(loc.longitude ?? 0);
  }

  return { element, update };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/location-picker.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/location/createLocationPicker.js tests/unit/location-picker.test.js
git commit -m "feat(location): lightweight city picker"
```

---

### Task 8: `BuildingOverview` — repoint areas button; disable in present

**Files:**
- Modify: `src/features/buildings/BuildingOverview.js:12-23`
- Test: `tests/unit/building-overview.test.js`

**Interfaces:**
- Consumes: `store` with `getState().view.phase`.
- Produces: "新建观察区" button (`overview-edit-areas`) dispatches `createStartAreaCreateCommand(current.id)`; disabled when `phase==='present'`.

- [ ] **Step 1: Update the tests**

In `tests/unit/building-overview.test.js`, change the `enters areas editor mode on 观察区与窗` test:

```js
  it('starts an area create session on 新建观察区', () => {
    const store = { execute: vi.fn(), getState: () => ({ view: { phase: 'edit' } }) };
    const { element, update } = createBuildingOverview({ store, confirmDelete: () => true });
    update(building());
    element.querySelector('[data-testid="overview-edit-areas"]').click();
    expect(store.execute).toHaveBeenCalledTimes(1);
    expect(store.execute.mock.calls[0][0].label).toBe('开始新建观察区');
  });

  it('disables editing actions in present phase', () => {
    const store = { execute: vi.fn(), getState: () => ({ view: { phase: 'present' } }) };
    const { element, update } = createBuildingOverview({ store, confirmDelete: () => true });
    update(building());
    expect(element.querySelector('[data-testid="overview-edit-building"]').disabled).toBe(true);
    expect(element.querySelector('[data-testid="overview-edit-areas"]').disabled).toBe(true);
  });
```

The other tests in this file use `store = { execute: vi.fn() }` (no `getState`). Update those two (`shows a read-only summary…`, `enters building editor mode…`, `deletes only after confirm`) to `store = { execute: vi.fn(), getState: () => ({ view: { phase: 'edit' } }) }` so the disable check has a phase to read.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/building-overview.test.js`
Expected: FAIL — label still '切换编辑模式'; not disabled.

- [ ] **Step 3: Implement**

`src/features/buildings/BuildingOverview.js` — import `createStartAreaCreateCommand`, relabel, gate by phase:

```js
import { createSetEditorModeCommand, createRemoveBuildingCommand, createStartAreaCreateCommand } from '../../store/buildingCommands.js';
```

Change the `editAreas` button definition:

```js
  const editAreas = createElement('button', {
    className: 'button button--secondary', text: '新建观察区',
    testId: 'overview-edit-areas', attributes: { type: 'button' }
  });
```

Change its handler:

```js
  editAreas.addEventListener('click', () => {
    if (current) store.execute(createStartAreaCreateCommand(current.id));
  });
```

In `update(b)`, after setting `current = b`, set disabled by phase:

```js
    const locked = store.getState()?.view?.phase === 'present';
    editBuilding.disabled = locked;
    editAreas.disabled = locked;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/building-overview.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/buildings/BuildingOverview.js tests/unit/building-overview.test.js
git commit -m "refactor(overview): repoint areas button to create session, gate by phase"
```

---

### Task 9: `AppShell` — header toggle, phase gating, location picker

**Files:**
- Modify: `src/features/shell/AppShell.js`
- Test: `tests/unit/app-shell.test.js`

**Interfaces:**
- Consumes: `createSetPhaseCommand`; `simulationController`; `store`.
- Produces: header `testId="phase-toggle"` with two buttons `phase-edit` / `phase-present`; timeline `hidden` when `phase==='edit'`; inspector hidden & results shown when `phase==='present'`; `createLocationPicker` mounted and visible only in present.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/app-shell.test.js`:

```js
import { createSetPhaseCommand } from '../../src/store/buildingCommands.js';

describe('AppShell phase toggle', () => {
  it('hides timeline and shows results in edit phase; shows location picker in present', () => {
    const { store, shell } = mount();
    expect(shell.querySelector('[data-testid="timeline"]').hidden).toBe(true);
    expect(shell.querySelector('[data-testid="location-picker"]').hidden).toBe(true);
    store.execute(createSetPhaseCommand('present'));
    expect(shell.querySelector('[data-testid="timeline"]').hidden).toBe(false);
    expect(shell.querySelector('[data-testid="location-picker"]').hidden).toBe(false);
  });

  it('forces results panel over inspector in present phase even when a building is selected', () => {
    const { store, shell } = mount();
    store.execute(createAddBuildingCommand({ id: 'b1' }));
    store.execute(createSetPhaseCommand('present'));
    expect(shell.querySelector('[data-testid="building-inspector"]').hidden).toBe(true);
    expect(shell.querySelector('[data-testid="results-panel"]').hidden).toBe(false);
  });
});
```

Note: `createTimeline` must expose `testId="timeline"` on its root element. If it does not currently, add `testId: 'timeline'` to the timeline root in `src/features/timeline/Timeline.js` (the outermost returned element).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/app-shell.test.js`
Expected: FAIL — toggle/picker not present; timeline not hidden.

- [ ] **Step 3: Implement**

In `src/features/shell/AppShell.js`:

Add imports:

```js
import { createSetPhaseCommand } from '../../store/buildingCommands.js';
import { createLocationPicker } from '../location/createLocationPicker.js';
import { showToast } from '../../ui/Toast.js';
```

Add a phase toggle to `createHeader` — change its signature to accept `{ onClearSandbox, onSetPhase }` and add a toggle group before `.header-actions`:

```js
function createHeader({ onClearSandbox, onSetPhase }) {
  const editBtn = createElement('button', {
    className: 'button button--ghost phase-toggle__btn is-active',
    text: '编辑', testId: 'phase-edit', attributes: { type: 'button' }
  });
  const presentBtn = createElement('button', {
    className: 'button button--ghost phase-toggle__btn',
    text: '展示', testId: 'phase-present', attributes: { type: 'button' }
  });
  editBtn.addEventListener('click', () => onSetPhase('edit'));
  presentBtn.addEventListener('click', () => onSetPhase('present'));
  const toggle = createElement('div', { className: 'phase-toggle', testId: 'phase-toggle' }, editBtn, presentBtn);
  return createElement(
    'header',
    { className: 'app-header' },
    createElement('div', { className: 'brand' },
      createElement('span', { className: 'brand__sun', attributes: { 'aria-hidden': 'true' } }),
      createElement('div', {},
        createElement('p', { className: 'brand__eyebrow', text: 'RESIDENTIAL DAYLIGHT' }),
        createElement('h1', { className: 'brand__title', text: '住宅采光模拟器' }))),
    toggle,
    createElement('div', { className: 'header-actions' },
      createElement('button', { className: 'button button--ghost', text: '清空沙盘',
        attributes: { type: 'button', 'data-action': 'clear-sandbox' } }),
      createElement('button', { className: 'button button--ghost button--import', text: '导入',
        attributes: { type: 'button', 'data-action': 'import-project' } }),
      createElement('button', { className: 'button button--ghost button--screenshot', text: '截图',
        attributes: { type: 'button', 'aria-label': '导出截图', 'data-action': 'export-screenshot' } }),
      createElement('button', { className: 'button button--primary', text: '保存项目',
        attributes: { type: 'button', 'data-action': 'save-project', 'data-primary-control': '' } })
    )
  );
}
```

In `createAppShell`, build the location picker and timeline once, gate by phase:

```js
  const locationPicker = createLocationPicker({ store });
  const timeline = createTimeline(simulationController);

  function setPhaseUI(project) {
    const present = project.view.phase === 'present';
    timeline.hidden = !present;
    locationPicker.element.hidden = !present;
    if (present) locationPicker.update(project);
    const editBtn = header.querySelector('[data-testid="phase-edit"]');
    const presentBtn = header.querySelector('[data-testid="phase-present"]');
    if (editBtn) editBtn.classList.toggle('is-active', !present);
    if (presentBtn) presentBtn.classList.toggle('is-active', present);
  }

  function trySetPhase(phase) {
    if (phase === 'present') {
      const hasArea = store.getState().buildings.some(b => (b.observationAreas ?? []).length > 0);
      if (!hasArea) {
        showToast('请先在编辑环节添加至少一个观察区。', 'error');
        return;
      }
    }
    store.execute(createSetPhaseCommand(phase));
  }
```

Wire the header with the toggle and update `updateInspector`:

```js
  const header = createHeader({ onClearSandbox, onSetPhase: trySetPhase });
  header.querySelector('[data-action="clear-sandbox"]').addEventListener('click', onClearSandbox);

  function updateInspector(project) {
    const present = project.view.phase === 'present';
    const hasSelection = Boolean(project.view.selectedBuildingId);
    buildingInspector.hidden = present || !hasSelection;
    resultsPanel.hidden = present ? false : hasSelection;
    setPhaseUI(project);
  }
  store.subscribe(updateInspector);
  updateInspector(store.getState());
```

Finally mount `timeline` and `locationPicker.element` in the shell. Replace the existing `createTimeline(simulationController)` in the `appShell` element with the pre-built `timeline`, and append `locationPicker.element` inside the workspace (e.g. as part of inspectorHost or a small bar above timeline). Minimal change: append `locationPicker.element` into `inspectorHost` before `resultsPanel`, and keep `timeline` in the shell children:

```js
  const inspectorHost = createElement(
    'aside',
    { className: 'inspector-host panel', testId: 'inspector' },
    buildingInspector,
    locationPicker.element,
    resultsPanel
  );
```

```js
  const appShell = createElement(
    'div',
    { className: 'app-shell', attributes: { 'data-mobile-panel': 'buildings' } },
    header,
    createElement('div', { className: 'workspace' }, projectTree, createViewport(), inspectorHost, sheet),
    timeline,
    navigation
  );
```

Also add `testId: 'timeline'` to the timeline root element in `src/features/timeline/Timeline.js` (the outermost element returned by `createTimeline`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/app-shell.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell/AppShell.js src/features/timeline/Timeline.js tests/unit/app-shell.test.js
git commit -m "feat(shell): edit/present toggle, phase-gated timeline and inspector"
```

---

### Task 10: `main.js` — phase-aware forwarding + screenshot watermark

**Files:**
- Modify: `src/main.js:79-105,132-144`

**Interfaces:**
- Consumes: `project.view.phase`.
- Produces: `updateSolar` called with phase; `updateAnalysis` only when `phase==='present'`; screenshot watermark uses `location.label ?? cityId`.

- [ ] **Step 1: No unit test (main.js is bootstrap); behavior covered by e2e in Task 12.**

- [ ] **Step 2: Implement**

In the store subscription (~line 79), gate `updateAnalysis` and pass phase to `updateSolar`:

```js
  store.subscribe(project => {
    const currentEditing = project.view.editorMode === 'building';
    if (!currentEditing && prevEditing) {
      clearTimeout(saveTimer);
      saveTimer = null;
      try { saveDraft(project); } catch { /* handled in scheduleSave */ }
    } else {
      scheduleSave(project);
    }
    prevEditing = currentEditing;
    shell.dataset.projectBuildings = String(project.buildings.length);
    const emptyHint = shell.querySelector('.viewport__empty');
    if (emptyHint) emptyHint.hidden = project.buildings.length > 0;
    const present = project.view.phase === 'present';
    const sim = simulationController.getState();
    withController(controller => {
      controller?.updateProject(project);
      controller?.updateSolar(sim, project.view.phase);
      if (present) controller?.updateAnalysis(project, sim);
      controller?.syncFloorFocus(project);
    });
  });
```

In the simulation subscription (~line 100):

```js
  simulationController.subscribe(state => {
    const present = store.getState().view.phase === 'present';
    withController(controller => {
      controller?.updateSolar(state, store.getState().view.phase);
      if (present) controller?.updateAnalysis(store.getState(), state);
    });
  });
```

In the screenshot handler (~line 132), use `label`:

```js
    const { location, simulation } = store.getState();
    try {
      await exportScreenshot(canvas, {
        city: location.label ?? (location.cityId === 'shenzhen' ? '深圳' : location.cityId),
        date: simulation.date,
        time: simulation.time
      });
```

- [ ] **Step 3: Verify build + smoke**

Run: `npx vitest run tests/unit/smoke.test.js && npm run build`
Expected: PASS / build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat(main): phase-aware scene updates and screenshot watermark"
```

---

### Task 11: `MobileShell` — phase-gated tabs

**Files:**
- Modify: `src/features/shell/MobileShell.js`
- Test: `tests/unit/app-shell.test.js` (extend the existing mobile test)

**Interfaces:**
- Consumes: `appShell.dataset.mobilePanel` and `view.phase` (read via a `phase` attribute on `.app-shell`).
- Produces: in edit phase, the 模拟/结果 tabs are hidden; in present phase, the 建筑 tab editing is read-only (tabs still navigate but editing actions are disabled by phase gating already in Tasks 6/8).

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/app-shell.test.js`:

```js
describe('AppShell mobile phase gating', () => {
  it('hides simulation/results tabs in edit phase and shows them in present', () => {
    const { store, shell } = mount();
    const nav = shell.querySelector('[data-testid="mobile-nav"]');
    const labels = [...nav.querySelectorAll('button')].map(b => b.textContent);
    expect(labels).toEqual(['场景', '建筑']); // edit phase: only 场景/建筑
    store.execute(createSetPhaseCommand('present'));
    const labelsPresent = [...nav.querySelectorAll('button:not([hidden])')].map(b => b.textContent);
    expect(labelsPresent).toEqual(['场景', '建筑', '模拟', '结果']);
  });
});
```

(Note: the simplest implementation hides tabs via `hidden` rather than removing them, so `not([hidden])` is the right selector. Adjust the edit-phase assertion to also use `:not([hidden])` if the impl keeps all four but hides two.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/app-shell.test.js`
Expected: FAIL — all four tabs always shown.

- [ ] **Step 3: Implement**

`createMobileControls` needs to know the phase to hide tabs. Since it is created before the store subscription, give the nav buttons stable `data-panel` attributes and toggle `hidden` from AppShell's `setPhaseUI`. In `src/features/shell/MobileShell.js`, add `data-panel` to each button:

```js
    const button = createElement('button', {
      className: label === '场景' ? 'mobile-nav__item is-active' : 'mobile-nav__item',
      text: label,
      attributes: { type: 'button', 'data-primary-control': '', 'data-panel': panel }
    });
```

Return `navigation` (already returned). Then in `AppShell.setPhaseUI` (Task 9), add:

```js
    const nav = shell.querySelector('[data-testid="mobile-nav"]');
    if (nav) {
      nav.querySelector('[data-panel="simulation"]')?.toggleAttribute('hidden', !present);
      nav.querySelector('[data-panel="results"]')?.toggleAttribute('hidden', !present);
    }
```

(Add this inside `setPhaseUI`, which already runs on every store change via `updateInspector`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/app-shell.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shell/MobileShell.js src/features/shell/AppShell.js tests/unit/app-shell.test.js
git commit -m "feat(mobile): hide simulation/results tabs in edit phase"
```

---

### Task 12: Cleanup dead code + e2e updates + final verify

**Files:**
- Delete: `src/features/location/LocationEditor.js`
- Delete: `src/features/floors/FloorSelector.js`
- Modify: e2e specs that reference removed UI (`area-home`, `area-create-start`, area names, etc.)

**Interfaces:** none new.

- [ ] **Step 1: Delete dead code**

```bash
git rm src/features/location/LocationEditor.js src/features/floors/FloorSelector.js
```

Grep for any remaining importers:
```bash
npx vitest run && npm run build
```
If build fails on a dangling import, remove the importer reference. (Explorer confirmed neither is imported.)

- [ ] **Step 2: Update e2e specs**

Search for removed testids / area-name flows:
```bash
npx playwright test --list
```
Update tests that reference `area-home`, `area-create-start`, `area-select` in the area panel, or assert area names like `客厅`:

- `tests/e2e/area-topdown.spec.js` — if it enters area editing via the right-panel "新建观察区" button, re-route via the left tree `building-add-area-<id>` button (or the overview `overview-edit-areas` button). If it references `area-card-<id>` or `area-empty-hint`, those are gone — use the tree `area-tree-<id>` instead.
- `tests/e2e/edit-modes.spec.js` — the "观察区与窗" overview button is now labeled "新建观察区"; update the click selector/text. The area panel no longer has a name field; remove name-related steps.
- `tests/e2e/simulation.spec.js` — if it asserts area option text `客厅`, change to `观察区 1`.

For each affected spec, run it (or `--list`) and adjust selectors/steps to match the new tree-driven flow and derived labels.

- [ ] **Step 3: Run full verification**

```bash
npm test
npm run test:e2e   # if no browsers available: npx playwright test --list
npm run build
```
Expected: all green (e2e at least parses via `--list`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead LocationEditor/FloorSelector, update e2e for tree-driven areas"
```

---

## Self-Review

**Spec coverage:**
- §1 phase split + Header toggle + edit gating + present behavior + transition rules → Tasks 1, 2, 9, 10, 11. ✓
- §2 left tree hierarchy + per-building add-area + right-panel params only + area tool strip + name removal → Tasks 2, 5, 6, 8. ✓
- §3 location picker + setPhase/setLocation commands + migration + mobile gating + testing → Tasks 1, 2, 7, 9, 11, 12. ✓
- Acceptance: edit no timeline/sim/neutral light (Tasks 4, 9, 10); tree hierarchy (6); no name (2, 5); right panel params only (5); present locks geometry (6, 8); location picker (7); dead code removed (12); mobile consistent (11); verify commands (12). ✓

**Placeholder scan:** none — each step has concrete code or exact commands.

**Type consistency:** `createSetPhaseCommand(phase)` / `createSetLocationCommand(location)` consistent across Tasks 2, 7, 9. `areaLabel(area, index)` consistent across Tasks 2, 3, 6. `applySunLighting(light, solar, { phase })` and `updateSolar(state, phase)` consistent across Tasks 4, 10. `createProjectTree` testIds (`building-tree-<id>`, `building-add-area-<id>`, `area-tree-<id>`) consistent between Tasks 6 and 12. `phase-toggle` / `phase-edit` / `phase-present` testIds consistent between Task 9 tests and impl. `location-picker` / `location-city` consistent between Tasks 7 and 9.

**Notes / deviations from spec (called out):**
- The spec said "`simulationController.calculate` early-returns in edit." This plan instead keeps `calculate` running (cheap; preserves existing tests and instant present re-entry) and gates the *visibility* of simulation (timeline hidden, results hidden, `updateAnalysis` not forwarded, neutral scene light). The user-visible intent — "编辑环境不需要模拟光照" — is fully met: no sunlight is shown in edit. This avoids rewriting many sim-controller tests/fixtures. Flag for user awareness.
- `validateProject` is not extended to check `view.phase`; migration guarantees the value. Spec mentioned validate; migration is sufficient and lower-risk.
