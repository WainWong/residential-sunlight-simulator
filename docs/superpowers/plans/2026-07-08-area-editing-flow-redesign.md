# Area Editing Create/Edit Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing “create empty observation area, then draft/apply” UX with an explicit create/edit session flow where saving is the only moment an observation area is added or updated.

**Architecture:** Store a transient `view.areaEditing` session (`mode: 'create' | 'edit'`) that owns floor/name/rects/tool while editing. The scene renders `areaEditing.rects` in top-down focus, but official `building.observationAreas` are only changed by `createSaveAreaEditingCommand()`. The area panel becomes a home/list screen plus create/edit session screens; no dropdown in the editing UI.

**Tech Stack:** Vite + vanilla JS + Three.js 0.185; vitest (node/jsdom); Playwright.

## Global Constraints

- Node >= 22.12; no new runtime dependencies.
- Browser-only app; no backend.
- UI copy should read naturally to non-technical end users; Chinese-first.
- New interactions must support mouse, keyboard, and touch.
- Domain layer stays free of DOM, Three.js, and store imports.
- Do not change the official observation area data model: `{ id, name, floor, rects, sampleHeight }`.
- Do not change sunlight simulation algorithms.
- Before completion: `npm test` and `npm run build` must pass.

Spec: `docs/superpowers/specs/2026-07-08-area-editing-flow-redesign.md`.

---

## File Structure

- `src/store/buildingCommands.js` — replace draft commands with `areaEditing` session commands; keep low-level add/update commands if still used elsewhere.
- `src/domain/project/defaultProject.js` — default `view.areaEditing: null`; remove/ignore `areaDraft` in the active UI.
- `src/domain/project/migrateProject.js` — backfill `areaEditing: null`; drop stale `areaDraft`.
- `src/domain/buildings/areaEditing.js` — pure helpers: create default session, clone existing area into session, summarize rect area, save patch payload.
- `src/features/areas/createAreaFloorTool.js` — rewrite as `createAreaPanel`-style home/create/edit renderer while keeping export name for `BuildingInspector` compatibility.
- `src/scene/analysisOverlays.js` — render `view.areaEditing.rects` when editing; otherwise render official active area for results.
- `src/scene/createSceneController.js` — floor focus enters when `areaEditing` exists, uses `areaEditing.floor`, drag commits to `createUpdateAreaEditingCommand({ rects })`.
- `src/main.js` — transition floor focus based on `Boolean(view.areaEditing)`, not only `editorMode === 'areas'`.
- `tests/unit/*` and `tests/e2e/area-topdown.spec.js` — update to new flow.

---

### Task 1: Store areaEditing session commands

**Files:**
- Create: `src/domain/buildings/areaEditing.js`
- Modify: `src/store/buildingCommands.js`
- Modify: `src/domain/project/defaultProject.js`
- Test: `tests/unit/building-commands.test.js`

**Interfaces:**
- Produces:
  - `createAreaEditingSession({ mode, buildingId, area = null, defaults = {} })`
  - `rectArea(rects)`
  - `createStartAreaCreateCommand(buildingId)`
  - `createStartAreaEditCommand(buildingId, areaId)`
  - `createUpdateAreaEditingCommand(patch)`
  - `createCancelAreaEditingCommand()`
  - `createSaveAreaEditingCommand()`
- `view.areaEditing` shape:
```js
{
  mode: 'create' | 'edit', buildingId, areaId,
  floor, name, rects, tool
}
```

- [ ] **Step 1: Write failing tests**

Append to `tests/unit/building-commands.test.js`:

```js
describe('area editing session commands', () => {
  const base = {
    simulation: { activeAreaId: null },
    view: { selectedBuildingId: 'b1', editorMode: 'areas', areaEditing: null },
    buildings: [{
      id: 'b1', revision: 1, params: { floors: 5 },
      observationAreas: [{ id: 'a1', name: '客厅', floor: 2, rects: [{ x0: 0, z0: 0, x1: 2, z1: 2 }], sampleHeight: 0 }]
    }]
  };

  it('starts a create session without adding an observation area', () => {
    const next = createStartAreaCreateCommand('b1').apply(base);
    expect(next.buildings[0].observationAreas).toHaveLength(1);
    expect(next.view.areaEditing).toMatchObject({ mode: 'create', buildingId: 'b1', areaId: null, floor: 1, name: '', rects: [], tool: 'draw' });
    expect(next.view.editorMode).toBe('areas');
  });

  it('starts an edit session by cloning the existing area', () => {
    const next = createStartAreaEditCommand('b1', 'a1').apply(base);
    expect(next.view.areaEditing).toMatchObject({ mode: 'edit', buildingId: 'b1', areaId: 'a1', floor: 2, name: '客厅', tool: 'draw' });
    expect(next.view.areaEditing.rects).toEqual([{ x0: 0, z0: 0, x1: 2, z1: 2 }]);
    expect(next.view.areaEditing.rects).not.toBe(base.buildings[0].observationAreas[0].rects);
  });

  it('patches the active editing session', () => {
    const editing = createStartAreaCreateCommand('b1').apply(base);
    const next = createUpdateAreaEditingCommand({ floor: 3, name: '卧室', rects: [{ x0: 1, z0: 1, x1: 3, z1: 3 }] }).apply(editing);
    expect(next.view.areaEditing).toMatchObject({ floor: 3, name: '卧室' });
    expect(next.view.areaEditing.rects).toEqual([{ x0: 1, z0: 1, x1: 3, z1: 3 }]);
  });

  it('cancels editing without changing official areas', () => {
    const editing = createUpdateAreaEditingCommand({ rects: [{ x0: 9, z0: 9, x1: 10, z1: 10 }] }).apply(createStartAreaEditCommand('b1', 'a1').apply(base));
    const next = createCancelAreaEditingCommand().apply(editing);
    expect(next.view.areaEditing).toBeNull();
    expect(next.buildings[0].observationAreas[0].rects).toEqual([{ x0: 0, z0: 0, x1: 2, z1: 2 }]);
  });

  it('saving a create session adds the area and selects it for results', () => {
    const editing = createUpdateAreaEditingCommand({ name: '书房', floor: 3, rects: [{ x0: 1, z0: 1, x1: 2, z1: 2 }] }).apply(createStartAreaCreateCommand('b1').apply(base));
    const next = createSaveAreaEditingCommand().apply(editing);
    expect(next.view.areaEditing).toBeNull();
    expect(next.buildings[0].observationAreas).toHaveLength(2);
    expect(next.buildings[0].observationAreas[1]).toMatchObject({ name: '书房', floor: 3, rects: [{ x0: 1, z0: 1, x1: 2, z1: 2 }], sampleHeight: 0 });
    expect(next.simulation.activeAreaId).toBe(next.buildings[0].observationAreas[1].id);
  });

  it('saving an edit session updates the official area', () => {
    const editing = createUpdateAreaEditingCommand({ name: '主卧', floor: 4, rects: [{ x0: 2, z0: 2, x1: 4, z1: 4 }] }).apply(createStartAreaEditCommand('b1', 'a1').apply(base));
    const next = createSaveAreaEditingCommand().apply(editing);
    expect(next.view.areaEditing).toBeNull();
    expect(next.buildings[0].observationAreas[0]).toMatchObject({ id: 'a1', name: '主卧', floor: 4, rects: [{ x0: 2, z0: 2, x1: 4, z1: 4 }] });
    expect(next.simulation.activeAreaId).toBe('a1');
  });
});
```

Add imports for the six command factories.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/building-commands.test.js`
Expected: FAIL with missing command exports.

- [ ] **Step 3: Implement helper**

Create `src/domain/buildings/areaEditing.js`:

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
    name: area?.name ?? defaults.name ?? '',
    rects: cloneRects(area?.rects ?? defaults.rects ?? []),
    tool: defaults.tool ?? 'draw'
  };
}

export function rectArea(rects = []) {
  return rects.reduce((sum, r) => sum + Math.abs((r.x1 - r.x0) * (r.z1 - r.z0)), 0);
}
```

- [ ] **Step 4: Implement store commands**

In `src/store/buildingCommands.js`, import the helper:

```js
import { createAreaEditingSession } from '../domain/buildings/areaEditing.js';
```

Add commands after observation-area commands:

```js
export function createStartAreaCreateCommand(buildingId) {
  return {
    label: '开始新建观察区',
    apply(state) {
      return {
        ...state,
        view: {
          ...state.view,
          editorMode: 'areas',
          areaEditing: createAreaEditingSession({ mode: 'create', buildingId })
        }
      };
    }
  };
}

export function createStartAreaEditCommand(buildingId, areaId) {
  return {
    label: '开始编辑观察区',
    apply(state) {
      const building = state.buildings.find(b => b.id === buildingId);
      const area = (building?.observationAreas ?? []).find(a => a.id === areaId);
      if (!building || !area) return state;
      return {
        ...state,
        view: {
          ...state.view,
          editorMode: 'areas',
          areaEditing: createAreaEditingSession({ mode: 'edit', buildingId, area })
        }
      };
    }
  };
}

export function createUpdateAreaEditingCommand(patch) {
  return {
    label: '修改观察区编辑会话',
    apply(state) {
      if (!state.view.areaEditing) return state;
      return { ...state, view: { ...state.view, areaEditing: { ...state.view.areaEditing, ...patch } } };
    }
  };
}

export function createCancelAreaEditingCommand() {
  return {
    label: '取消观察区编辑',
    apply(state) {
      if (!state.view.areaEditing) return state;
      return { ...state, view: { ...state.view, areaEditing: null } };
    }
  };
}

export function createSaveAreaEditingCommand() {
  return {
    label: '保存观察区',
    apply(state) {
      const editing = state.view.areaEditing;
      if (!editing || editing.rects.length === 0) return state;
      const areaId = editing.mode === 'edit'
        ? editing.areaId
        : (globalThis.crypto?.randomUUID?.() ?? `area-${Date.now()}`);
      const name = editing.name.trim() || `观察区 ${((state.buildings.find(b => b.id === editing.buildingId)?.observationAreas?.length ?? 0) + 1)}`;
      const area = { id: areaId, name, floor: editing.floor, rects: editing.rects, sampleHeight: 0 };
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

`defaultProject.js`: add `areaEditing: null` next to view fields.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/building-commands.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/buildings/areaEditing.js src/store/buildingCommands.js src/domain/project/defaultProject.js tests/unit/building-commands.test.js
git commit -m "feat: add area editing session commands"
```

---

### Task 2: Migrate and deprecate draft state

**Files:**
- Modify: `src/domain/project/migrateProject.js`
- Modify: `src/domain/buildings/areaDraft.js` or delete if no longer used after later tasks
- Test: `tests/unit/migrate-project.test.js`

**Interfaces:**
- Produces: migrated projects have `view.areaEditing = null`; stale `view.areaDraft` is removed or set null and ignored.

- [ ] **Step 1: Write failing tests**

Append:

```js
it('drops stale area draft and ensures areaEditing is null', () => {
  const migrated = migrateProject({
    schemaVersion: 1,
    buildings: [],
    view: { areaDraft: { buildingId: 'b1', areaId: 'a1', rects: [] }, areaTool: 'erase' }
  });
  expect(migrated.view.areaEditing).toBeNull();
  expect(migrated.view.areaDraft).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/migrate-project.test.js`
Expected: FAIL until migration drops `areaDraft` / adds `areaEditing`.

- [ ] **Step 3: Implement**

In `migrateProject`, after `const view = ...`:

```js
  view.areaEditing = null;
  delete view.areaDraft;
```

Keep `areaTool` normalization if older code/tests still need it; it can be removed in a later cleanup only after no references remain.

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/unit/migrate-project.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/project/migrateProject.js tests/unit/migrate-project.test.js
git commit -m "feat: migrate area editing session state"
```

---

### Task 3: Rewrite area panel home/create/edit UI

**Files:**
- Modify: `src/features/areas/createAreaFloorTool.js`
- Test: `tests/unit/area-floor-tool.test.js`

**Interfaces:**
- Consumes store commands from Task 1.
- Produces DOM states:
  - Home empty state: `area-home`, `area-empty-hint`, `area-create-start`; no select.
  - Home list state: cards with `area-card-<id>`, `area-edit-<id>`, `area-delete-<id>`.
  - Session state: `area-session`, floor/name inputs, rect summary, cancel/save; save disabled until rects non-empty.

- [ ] **Step 1: Replace tests for old dropdown/draft UI**

Rewrite `tests/unit/area-floor-tool.test.js` around new flow:

```js
it('shows an empty home state with no selector when there are no areas', () => {
  const store = fakeStore();
  const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
  update({ id: 'b1', name: '1号楼', params: { floors: 5 }, observationAreas: [] });
  expect(q(element, 'area-home')).not.toBeNull();
  expect(q(element, 'area-select')).toBeNull();
  expect(q(element, 'area-empty-hint').textContent).toContain('还没有观察区');
});

it('starts create session without adding an area', () => {
  const store = fakeStore();
  const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
  update({ id: 'b1', name: '1号楼', params: { floors: 5 }, observationAreas: [] });
  q(element, 'area-create-start').click();
  expect(store.execute.mock.calls.at(-1)[0].label).toBe('开始新建观察区');
});

it('lists existing areas as cards, not a dropdown', () => {
  const store = fakeStore();
  const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
  update(building());
  expect(q(element, 'area-select')).toBeNull();
  expect(q(element, 'area-card-a1')).not.toBeNull();
  expect(q(element, 'area-edit-a1')).not.toBeNull();
});

it('renders create session with disabled save until rects exist', () => {
  const store = fakeStore({ view: { areaEditing: { mode: 'create', buildingId: 'b1', areaId: null, floor: 1, name: '', rects: [], tool: 'draw' } } });
  const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
  update(building());
  expect(q(element, 'area-session-title').textContent).toContain('新建观察区');
  expect(q(element, 'area-save').disabled).toBe(true);
});

it('renders edit session and dispatches save/cancel/update commands', () => {
  const store = fakeStore({ view: { areaEditing: { mode: 'edit', buildingId: 'b1', areaId: 'a1', floor: 2, name: '客厅', rects: [{ x0: 0, z0: 0, x1: 2, z1: 2 }], tool: 'draw' } } });
  const { element, update } = createAreaFloorTool({ store, buildingId: 'b1' });
  update(building());
  expect(q(element, 'area-session-title').textContent).toContain('编辑观察区');
  q(element, 'area-save').click();
  expect(store.execute.mock.calls.at(-1)[0].label).toBe('保存观察区');
  q(element, 'area-cancel').click();
  expect(store.execute.mock.calls.at(-1)[0].label).toBe('取消观察区编辑');
});
```

- [ ] **Step 2: Run tests to fail**

Run: `npx vitest run tests/unit/area-floor-tool.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement UI renderer**

Rewrite `createAreaFloorTool` internal render to branch on `store.getState().view.areaEditing`.

Key imports:

```js
import {
  createCancelAreaEditingCommand,
  createRemoveObservationAreaCommand,
  createSaveAreaEditingCommand,
  createStartAreaCreateCommand,
  createStartAreaEditCommand,
  createUpdateAreaEditingCommand,
  createSetEditorModeCommand
} from '../../store/buildingCommands.js';
import { rectArea } from '../../domain/buildings/areaEditing.js';
```

If no remove-observation-area command exists yet, create it in Task 1 or here:
`createRemoveObservationAreaCommand(buildingId, areaId)` removes an area and clears `simulation.activeAreaId` if it was selected.

Render home:

```js
function renderHome(building) {
  const areas = building.observationAreas ?? [];
  const children = [back, label, titleWithBuildingName];
  if (areas.length === 0) children.push(emptyHint);
  else children.push(...areas.map(areaCard));
  children.push(createStartButton);
  element.replaceChildren(...children);
}
```

Render session with floor/name inputs, rect summary, optional tools, cancel/save.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/area-floor-tool.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/areas/createAreaFloorTool.js tests/unit/area-floor-tool.test.js src/store/buildingCommands.js
git commit -m "feat: redesign area panel as create-edit flow"
```

---

### Task 4: Scene/overlay integration with areaEditing

**Files:**
- Modify: `src/scene/analysisOverlays.js`
- Modify: `src/scene/createSceneController.js`
- Modify: `src/main.js`
- Test: `tests/unit/scene-analysis.test.js`

**Interfaces:**
- Consumes `view.areaEditing`.
- Produces: if `areaEditing` exists, scene overlay/floor focus uses its `buildingId/floor/rects/tool`; drag updates editing rects.

- [ ] **Step 1: Write failing overlay test**

Add to `tests/unit/scene-analysis.test.js`:

```js
it('renders areaEditing rects while editing without requiring an active saved area', () => {
  const out = buildAnalysisOverlays({
    ...project,
    view: { areaEditing: { mode: 'create', buildingId: 'b1', areaId: null, floor: 2, name: '', rects: [{ x0: 0, z0: 0, x1: 1, z1: 1 }], tool: 'draw' } }
  }, { activeAreaId: null, litSampleIds: [], noArea: false });
  expect(out.area.draft).toBe(true);
  expect(out.area.rects).toEqual([{ x0: 0, z0: 0, x1: 1, z1: 1 }]);
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/unit/scene-analysis.test.js`
Expected: FAIL because activeAreaId is required.

- [ ] **Step 3: Update analysisOverlays**

At top of `buildAnalysisOverlays`, before activeArea logic:

```js
const editing = project.view?.areaEditing;
if (editing) {
  const building = project.buildings.find(b => b.id === editing.buildingId);
  if (!building) return null;
  const baseY = floorBaseY({ floor: editing.floor, ...building.params });
  return {
    area: {
      rects: editing.rects,
      baseY,
      lit: false,
      draft: true,
      group: { position: { x: building.position.x, z: building.position.z }, rotationDeg: building.rotation }
    },
    openings: []
  };
}
```

Official active-area path remains for results.

- [ ] **Step 4: Update createSceneController**

`enterFloorFocus(project)` should use `project.view.areaEditing`:

```js
const editing = project.view.areaEditing;
if (!editing) return;
const buildingId = editing.buildingId;
const floor = editing.floor;
```

`onCommit`:

```js
const editing = store.getState().view.areaEditing;
if (!editing) return;
const rects = applyRectEdit(editing.rects ?? [], rect, mode);
store.execute(createUpdateAreaEditingCommand({ rects }));
```

`floorFocus.tool = editing.tool ?? 'draw'`.

- [ ] **Step 5: Update main.js transitions**

Track `prevAreaEditing = Boolean(store.getState().view.areaEditing)`.

In store subscriber:

```js
const currentAreaEditing = Boolean(project.view.areaEditing);
if (currentAreaEditing !== prevAreaEditing) {
  withController(controller => {
    if (!controller) return;
    if (currentAreaEditing) controller.enterFloorFocus(project, simulationController.getState());
    else controller.exitFloorFocus();
  });
} else if (currentAreaEditing) {
  withController(controller => controller?.setFloorTool(project.view.areaEditing.tool));
}
prevAreaEditing = currentAreaEditing;
```

Keep `editorMode === 'areas'` for inspector routing, but floor focus is now tied to editing session.

- [ ] **Step 6: Run tests/build**

Run: `npx vitest run tests/unit/scene-analysis.test.js && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/scene/analysisOverlays.js src/scene/createSceneController.js src/main.js tests/unit/scene-analysis.test.js
git commit -m "feat: drive floor focus from area editing sessions"
```

---

### Task 5: Remove old draft UI/state references from active flow

**Files:**
- Modify: `src/store/buildingCommands.js`
- Modify: `src/domain/project/defaultProject.js`
- Delete or leave unused with no imports: `src/domain/buildings/areaDraft.js`
- Test: full unit suite

**Interfaces:**
- Produces: no active code imports `areaDraft` helper or dispatches draft commands.

- [ ] **Step 1: Search old references**

Run:

```bash
rg "areaDraft|AreaDraft|createUpdateAreaDraftCommand|createApplyAreaDraftCommand|createClearAreaDraftCommand|isDraftFor|resolveDraftRects|areaTool|createSetAreaToolCommand" src tests
```

Expected before cleanup: references remain only in deprecated tests/commands.

- [ ] **Step 2: Remove or quarantine old code**

Remove unused draft commands and helper imports if no tests rely on them. If keeping for migration compatibility, do not import them from UI/scene.

`defaultProject.js`: remove `areaDraft`; optionally remove `areaTool` if no active reference remains.

- [ ] **Step 3: Update tests**

Remove old area-draft command tests and old area-tool tests replaced by areaEditing tests.

- [ ] **Step 4: Run full tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "refactor: remove legacy area draft flow"
```

---

### Task 6: E2E new create/edit flow

**Files:**
- Modify: `tests/e2e/area-topdown.spec.js`

**Interfaces:**
- Produces end-to-end assertions for the user-facing flow.

- [ ] **Step 1: Rewrite e2e to new flow**

Test must assert:

1. From building overview click `设置采光观察区`.
2. No areas: empty state visible, `area-select` absent.
3. Click `area-create-start`.
4. `area-session-title` contains `新建观察区`.
5. Drag on canvas.
6. `area-save` becomes enabled.
7. Click save.
8. Back on `area-home`, card appears.
9. Click edit card; modify name or reset; cancel does not remove card.
10. Dragging does not return to building overview.

- [ ] **Step 2: Validate parse**

Run: `npx playwright test tests/e2e/area-topdown.spec.js --list`
Expected: test listed for desktop/mobile projects.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/area-topdown.spec.js
git commit -m "test: cover area create-edit flow end to end"
```

---

### Task 7: Final verification and branch cleanup

**Files:**
- No source unless tests reveal issues.

- [ ] **Step 1: Run focused and full verification**

Run:

```bash
npx vitest run
npm run build
npx playwright test tests/e2e/area-topdown.spec.js --list
```

Expected:
- Unit tests pass.
- Build succeeds.
- Playwright list parses.

- [ ] **Step 2: Manual smoke in dev server**

Run:

```bash
npm run dev
```

Open local URL and check:
- Observe no ambiguous “观察区 1” dropdown before saving.
- New area only appears after save.
- Dragging does not return to building overview.

- [ ] **Step 3: Commit any final fixes**

If changes were needed:

```bash
git add <files>
git commit -m "fix: polish area create-edit flow"
```

---

## Self-Review

- Spec coverage: lifecycle, no empty area objects, building binding, home/list UI, create/edit session, floor focus, store commands, migration, tests all covered.
- No placeholders: every task has exact files, commands, expected results, and core code snippets.
- Type consistency: `view.areaEditing` shape is consistent across store/UI/scene; official `observationAreas` model remains unchanged.
- Known execution note: this plan intentionally supersedes `docs/superpowers/plans/2026-07-08-area-editing-ux.md`; do not implement old `areaDraft` UX further.
