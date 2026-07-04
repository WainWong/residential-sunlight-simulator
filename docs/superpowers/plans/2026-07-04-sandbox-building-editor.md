# Sandbox Building Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the project wizard and static demo shell with a persistent empty sandbox where users edit buildings by live X/Y coordinates and independently play annual date or daily time changes with synchronized sunlight and shadows.

**Architecture:** A single `createStore` instance owns the project. Building commands, the object tree, the inline inspector, the simulation controller, the Three.js controller, timelines, and local draft persistence all read from or write to that store. Derived solar state is calculated from the current project and passed to both results and scene lighting; Three.js keeps X/Z internally while the UI exposes X/Y.

**Tech Stack:** Vite 8, JavaScript ES Modules, Three.js 0.185, Luxon 3.7, SunCalc 1.9, Vitest 4, Playwright 1.61.

---

## File map

### New files

- `src/domain/buildings/editorCoordinates.js` — UI X/Y to scene X/Z conversion and rotation normalization.
- `src/store/buildingCommands.js` — add, update, finish, cancel, delete, select, and clear building commands.
- `src/features/buildings/BuildingInspector.js` — inline live building editor.
- `src/features/timeline/dateRange.js` — date-to-day-index conversion for regular and leap years.
- `src/scene/sandboxAids.js` — 10 m grid and coordinate origin helpers.
- `src/scene/sunLighting.js` — maps solar state to the directional light.
- `tests/unit/building-commands.test.js` — building model and command behavior.
- `tests/unit/date-range.test.js` — annual date range and playback boundaries.
- `tests/unit/sun-lighting.test.js` — sunlight direction, shadow, and night behavior.
- `tests/e2e/sandbox-editor.spec.js` — empty sandbox, blueprint, selection, persistence, and clear flows.

### Modified files

- `src/domain/project/defaultProject.js` — editor selection state defaults.
- `src/features/results/createSimulationController.js` — derive from the project store.
- `src/features/results/ResultsPanel.js` — react to store-backed solar state.
- `src/features/timeline/usePlayback.js` — reusable independent playback.
- `src/features/timeline/Timeline.js` — annual date row plus daily time row.
- `src/features/shell/DesktopShell.js` — dynamic object tree.
- `src/features/shell/MobileShell.js` — mobile panel selection for scene, editor, simulation, and results.
- `src/features/shell/AppShell.js` — compose the real tree, sandbox, inspector, results, and dual timeline.
- `src/scene/buildingMesh.js` — blueprint material.
- `src/scene/syncScene.js` — rebuild when preview state changes.
- `src/scene/createScene.js` — attach grid and coordinate helpers.
- `src/scene/createSceneController.js` — building picking and solar synchronization.
- `src/main.js` — one store, autosave, import/export, add, clear, and scene wiring.
- `src/styles/layout.css` — updated desktop and mobile workspace layout.
- `src/styles/controls.css` — selected tree and destructive controls.
- `src/styles/editors.css` — inline building inspector and validation.
- `src/styles/simulation.css` — dual timeline styling.
- `tests/unit/simulation-controller.test.js` — store-backed time/date assertions.
- `tests/unit/scene-sync.test.js` — blueprint and preview signature behavior.
- `tests/e2e/responsive-shell.spec.js` — updated mobile behavior.
- `tests/e2e/accessibility-performance.spec.js` — new primary controls.
- `tests/e2e/simulation.spec.js` — date/time sunlight synchronization.
- `README.md` — document empty-sandbox workflow and remove example-first wording.

### Retained but removed from the main path

- `src/features/wizard/Wizard.js`
- `src/features/buildings/BuildingEditor.js`
- `public/examples/shenzhen-winter-solstice.sunlight.json`

These remain available for later migration or manual import but are no longer imported by `src/main.js`.

---

### Task 1: Building coordinates and project commands

**Files:**
- Create: `src/domain/buildings/editorCoordinates.js`
- Create: `src/store/buildingCommands.js`
- Modify: `src/domain/project/defaultProject.js`
- Test: `tests/unit/building-commands.test.js`

- [ ] **Step 1: Write the failing coordinate and command tests**

```js
// tests/unit/building-commands.test.js
import { describe, expect, it } from 'vitest';
import {
  editorPositionToScene,
  normalizeRotation,
  scenePositionToEditor
} from '../../src/domain/buildings/editorCoordinates.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createStore } from '../../src/store/createStore.js';
import {
  createAddBuildingCommand,
  createCancelAddedBuildingCommand,
  createClearBuildingsCommand,
  createFinishBuildingCommand,
  createSelectBuildingCommand,
  createUpdateBuildingCommand
} from '../../src/store/buildingCommands.js';

describe('building editor coordinates', () => {
  it('maps UI X/Y to scene X/Z without changing north', () => {
    expect(editorPositionToScene({ x: 12.5, y: -8 })).toEqual({ x: 12.5, z: -8 });
    expect(scenePositionToEditor({ x: 4, z: 9 })).toEqual({ x: 4, y: 9 });
  });

  it('normalizes clockwise rotation into 0–359.9 degrees', () => {
    expect(normalizeRotation(375)).toBe(15);
    expect(normalizeRotation(-30)).toBe(330);
  });
});

describe('building commands', () => {
  it('adds a persisted building draft at the origin', () => {
    const store = createStore(createDefaultProject());
    store.execute(createAddBuildingCommand({ id: 'building-a' }));

    expect(store.getState().buildings[0]).toMatchObject({
      id: 'building-a',
      revision: 1,
      template: 'bar',
      position: { x: 0, z: 0 },
      rotation: 0
    });
    expect(store.getState().view).toMatchObject({
      selectedBuildingId: 'building-a',
      editingBuildingId: 'building-a',
      addingBuildingId: 'building-a'
    });
  });

  it('updates coordinates and geometry with one revision increment', () => {
    const store = createStore(createDefaultProject());
    store.execute(createAddBuildingCommand({ id: 'building-a' }));
    store.execute(createUpdateBuildingCommand('building-a', {
      position: { x: 18, z: -24 },
      rotation: 375,
      params: { length: 72 }
    }));

    expect(store.getState().buildings[0]).toMatchObject({
      revision: 2,
      position: { x: 18, z: -24 },
      rotation: 15,
      params: { length: 72, depth: 18, floors: 33, floorHeight: 3 }
    });
  });

  it('finishes, reselects, cancels a new building, and clears only scene objects', () => {
    const store = createStore(createDefaultProject());
    store.execute(createAddBuildingCommand({ id: 'building-a' }));
    store.execute(createFinishBuildingCommand('building-a'));
    expect(store.getState().view.editingBuildingId).toBeNull();

    store.execute(createSelectBuildingCommand('building-a', { editing: true }));
    expect(store.getState().view.editingBuildingId).toBe('building-a');

    store.execute(createCancelAddedBuildingCommand('building-a'));
    expect(store.getState().buildings).toHaveLength(0);

    store.execute(createAddBuildingCommand({ id: 'building-b' }));
    const before = store.getState();
    store.execute(createClearBuildingsCommand());
    expect(store.getState().buildings).toEqual([]);
    expect(store.getState().location).toEqual(before.location);
    expect(store.getState().simulation).toEqual(before.simulation);
  });
});
```

- [ ] **Step 2: Run the new test and verify the missing modules fail**

Run:

```powershell
npm test -- tests/unit/building-commands.test.js
```

Expected: FAIL because `editorCoordinates.js` and `buildingCommands.js` do not exist.

- [ ] **Step 3: Implement coordinate conversion and building commands**

```js
// src/domain/buildings/editorCoordinates.js
export function editorPositionToScene(position) {
  return { x: Number(position.x), z: Number(position.y) };
}

export function scenePositionToEditor(position) {
  return { x: Number(position.x), y: Number(position.z) };
}

export function normalizeRotation(value) {
  const numeric = Number(value);
  return ((numeric % 360) + 360) % 360;
}
```

```js
// src/store/buildingCommands.js
import { normalizeRotation } from '../domain/buildings/editorCoordinates.js';

const TEMPLATE_DEFAULTS = {
  bar: { length: 60, depth: 18 },
  lShape: { length: 60, depth: 40, wingLength: 18, wingDepth: 16 },
  courtyard: { length: 60, depth: 40, courtyardLength: 30, courtyardDepth: 16 }
};

function nextBuildingName(buildings) {
  return `住宅 ${buildings.length + 1}`;
}

function findBuilding(state, buildingId) {
  return state.buildings.find(building => building.id === buildingId);
}

export function createAddBuildingCommand(overrides = {}) {
  return {
    label: '添加建筑',
    apply(state) {
      const id = overrides.id ?? globalThis.crypto?.randomUUID?.() ?? `building-${Date.now()}`;
      const template = overrides.template ?? 'bar';
      const building = {
        id,
        revision: 1,
        name: overrides.name ?? nextBuildingName(state.buildings),
        template,
        position: { x: 0, z: 0, ...overrides.position },
        rotation: normalizeRotation(overrides.rotation ?? 0),
        params: {
          ...TEMPLATE_DEFAULTS[template],
          floors: 33,
          floorHeight: 3,
          ...overrides.params
        },
        observationAreas: [],
        openings: []
      };
      return {
        ...state,
        buildings: [...state.buildings, building],
        view: {
          ...state.view,
          selectedBuildingId: id,
          editingBuildingId: id,
          addingBuildingId: id
        }
      };
    }
  };
}

export function createUpdateBuildingCommand(buildingId, patch) {
  return {
    label: '修改建筑',
    apply(state) {
      if (!findBuilding(state, buildingId)) return state;
      return {
        ...state,
        buildings: state.buildings.map(building => {
          if (building.id !== buildingId) return building;
          return {
            ...building,
            ...patch,
            revision: (building.revision ?? 0) + 1,
            position: { ...building.position, ...patch.position },
            rotation: patch.rotation == null
              ? building.rotation
              : normalizeRotation(patch.rotation),
            params: { ...building.params, ...patch.params }
          };
        })
      };
    }
  };
}

export function createSelectBuildingCommand(buildingId, { editing = false } = {}) {
  return {
    label: '选择建筑',
    apply(state) {
      return {
        ...state,
        view: {
          ...state.view,
          selectedBuildingId: buildingId,
          editingBuildingId: editing ? buildingId : state.view.editingBuildingId
        }
      };
    }
  };
}

export function createFinishBuildingCommand(buildingId) {
  return {
    label: '完成建筑',
    apply(state) {
      return {
        ...state,
        view: {
          ...state.view,
          selectedBuildingId: buildingId,
          editingBuildingId: null,
          addingBuildingId: null
        }
      };
    }
  };
}

export function createCancelAddedBuildingCommand(buildingId) {
  return {
    label: '取消添加建筑',
    apply(state) {
      if (state.view.addingBuildingId !== buildingId) return state;
      return {
        ...state,
        buildings: state.buildings.filter(building => building.id !== buildingId),
        view: {
          ...state.view,
          selectedBuildingId: null,
          editingBuildingId: null,
          addingBuildingId: null
        }
      };
    }
  };
}

export function createRemoveBuildingCommand(buildingId) {
  return {
    label: '删除建筑',
    apply(state) {
      return {
        ...state,
        buildings: state.buildings.filter(building => building.id !== buildingId),
        view: {
          ...state.view,
          selectedBuildingId: state.view.selectedBuildingId === buildingId
            ? null
            : state.view.selectedBuildingId,
          editingBuildingId: state.view.editingBuildingId === buildingId
            ? null
            : state.view.editingBuildingId,
          addingBuildingId: state.view.addingBuildingId === buildingId
            ? null
            : state.view.addingBuildingId
        }
      };
    }
  };
}

export function createClearBuildingsCommand() {
  return {
    label: '清空沙盘',
    apply(state) {
      return {
        ...state,
        buildings: [],
        simulation: { ...state.simulation, activeAreaId: null },
        view: {
          ...state.view,
          selectedBuildingId: null,
          editingBuildingId: null,
          addingBuildingId: null
        }
      };
    }
  };
}
```

Add the editor fields to `createDefaultProject()`:

```js
view: {
  camera: null,
  activePanel: 'buildings',
  wizardComplete: false,
  selectedBuildingId: null,
  editingBuildingId: null,
  addingBuildingId: null
}
```

- [ ] **Step 4: Run focused and related unit tests**

Run:

```powershell
npm test -- tests/unit/building-commands.test.js tests/unit/project-schema.test.js tests/unit/store.test.js
```

Expected: PASS, with 0 failed tests.

- [ ] **Step 5: Commit the domain slice**

```powershell
git add src/domain/buildings/editorCoordinates.js src/store/buildingCommands.js src/domain/project/defaultProject.js tests/unit/building-commands.test.js
git commit -m "feat: add persistent building editor commands"
```

---

### Task 2: Store-backed solar state and independent playback

**Files:**
- Create: `src/features/timeline/dateRange.js`
- Modify: `src/features/results/createSimulationController.js`
- Modify: `src/features/timeline/usePlayback.js`
- Test: `tests/unit/date-range.test.js`
- Test: `tests/unit/simulation-controller.test.js`

- [ ] **Step 1: Write failing annual-range and store synchronization tests**

```js
// tests/unit/date-range.test.js
import { describe, expect, it } from 'vitest';
import {
  dateToDayIndex,
  dayIndexToDate,
  daysInDateYear
} from '../../src/features/timeline/dateRange.js';

describe('annual date range', () => {
  it('round-trips a normal-year date', () => {
    expect(daysInDateYear('2026-01-01')).toBe(365);
    expect(dateToDayIndex('2026-12-31')).toBe(364);
    expect(dayIndexToDate('2026-01-01', 364)).toBe('2026-12-31');
  });

  it('includes leap day and wraps day indexes', () => {
    expect(daysInDateYear('2028-06-01')).toBe(366);
    expect(dayIndexToDate('2028-01-01', 365)).toBe('2028-12-31');
    expect(dayIndexToDate('2028-01-01', 366)).toBe('2028-01-01');
  });
});
```

Replace `tests/unit/simulation-controller.test.js` with:

```js
import { describe, expect, it, vi } from 'vitest';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';
import { createSimulationController } from '../../src/features/results/createSimulationController.js';
import { createPlayback } from '../../src/features/timeline/usePlayback.js';
import { createStore } from '../../src/store/createStore.js';

describe('store-backed simulation controller', () => {
  it('publishes solar results when project time changes', () => {
    const store = createStore(createDefaultProject());
    const controller = createSimulationController(store);
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setTime('12:00');

    expect(store.getState().simulation.time).toBe('12:00');
    expect(controller.getState().solar.altitudeDeg).toBeGreaterThan(0);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('changes date without changing time', () => {
    const store = createStore(createDefaultProject());
    const controller = createSimulationController(store);

    controller.setDate('2026-06-21');

    expect(store.getState().simulation.date).toBe('2026-06-21');
    expect(store.getState().simulation.time).toBe('09:30');
  });
});

describe('independent playback', () => {
  it('advances only the supplied value and wraps', () => {
    vi.useFakeTimers();
    let value = 364;
    const playback = createPlayback({
      read: () => value,
      write: next => { value = next; },
      min: 0,
      max: 364,
      step: 1,
      intervalMs: 100
    });

    playback.toggle();
    vi.advanceTimersByTime(100);
    expect(value).toBe(0);
    playback.dispose();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail for missing APIs**

Run:

```powershell
npm test -- tests/unit/date-range.test.js tests/unit/simulation-controller.test.js
```

Expected: FAIL because `dateRange.js` is missing and `createSimulationController` does not accept a store.

- [ ] **Step 3: Implement annual conversion, generic playback, and store-backed simulation**

```js
// src/features/timeline/dateRange.js
import { DateTime } from 'luxon';

function parseDate(date) {
  const value = DateTime.fromISO(date);
  if (!value.isValid) throw new Error(`无效日期：${date}`);
  return value;
}

export function daysInDateYear(date) {
  return parseDate(date).daysInYear;
}

export function dateToDayIndex(date) {
  return parseDate(date).ordinal - 1;
}

export function dayIndexToDate(anchorDate, index) {
  const anchor = parseDate(anchorDate);
  const days = anchor.daysInYear;
  const normalized = ((Math.round(index) % days) + days) % days;
  return DateTime.local(anchor.year, 1, 1).plus({ days: normalized }).toISODate();
}
```

```js
// src/features/timeline/usePlayback.js
export function createPlayback({
  read,
  write,
  min,
  max,
  step = 1,
  intervalMs = 250
}) {
  let timer = null;

  function stop() {
    if (timer != null) clearInterval(timer);
    timer = null;
  }

  return {
    get playing() {
      return timer != null;
    },
    toggle() {
      if (timer != null) {
        stop();
        return false;
      }
      timer = setInterval(() => {
        const next = read() + step;
        write(next > max ? min : next);
      }, intervalMs);
      return true;
    },
    stop,
    dispose: stop
  };
}
```

Refactor `src/features/results/createSimulationController.js` to keep the existing `timeToMinute` and `minuteToTime` exports, replace its private `input` state with:

```js
function calculate(project) {
  const { location, simulation } = project;
  const minute = timeToMinute(simulation.time);
  const solar = getSolarPosition({
    ...location,
    localDate: simulation.date,
    localTime: simulation.time
  });
  const hasDirectSun = solar.aboveHorizon &&
    minute >= DIRECT_INTERVAL.startMinute &&
    minute < DIRECT_INTERVAL.endMinute;
  return {
    location,
    date: simulation.date,
    time: simulation.time,
    minute,
    solar,
    hasDirectSun,
    litRatio: hasDirectSun ? 0.58 : 0,
    intervals: [DIRECT_INTERVAL],
    totalMinutes: DIRECT_INTERVAL.endMinute - DIRECT_INTERVAL.startMinute
  };
}

function simulationCommand(label, patch) {
  return {
    label,
    apply(state) {
      return {
        ...state,
        simulation: { ...state.simulation, ...patch }
      };
    }
  };
}

export function createSimulationController(store) {
  const listeners = new Set();
  let state = calculate(store.getState());
  const unsubscribe = store.subscribe(project => {
    state = calculate(project);
    for (const listener of listeners) listener(state);
  });
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTime(time) {
      store.execute(simulationCommand('调整时间', { time }));
    },
    setDate(date) {
      store.execute(simulationCommand('调整日期', { date }));
    },
    setLocation(location) {
      store.execute({
        label: '调整地点',
        apply(project) {
          return { ...project, location: { ...location } };
        }
      });
    },
    dispose() {
      unsubscribe();
      listeners.clear();
    }
  };
}
```

- [ ] **Step 4: Run the focused unit tests**

Run:

```powershell
npm test -- tests/unit/date-range.test.js tests/unit/simulation-controller.test.js
```

Expected: PASS, with the date and time dimensions changing independently.

- [ ] **Step 5: Commit the simulation state slice**

```powershell
git add src/features/timeline/dateRange.js src/features/timeline/usePlayback.js src/features/results/createSimulationController.js tests/unit/date-range.test.js tests/unit/simulation-controller.test.js
git commit -m "feat: unify annual and daily simulation state"
```

---

### Task 3: Sandbox aids, blueprint material, picking, and sunlight

**Files:**
- Create: `src/scene/sandboxAids.js`
- Create: `src/scene/sunLighting.js`
- Modify: `src/scene/createScene.js`
- Modify: `src/scene/buildingMesh.js`
- Modify: `src/scene/syncScene.js`
- Modify: `src/scene/createSceneController.js`
- Test: `tests/unit/scene-sync.test.js`
- Test: `tests/unit/sun-lighting.test.js`

- [ ] **Step 1: Write failing scene tests**

Append to `tests/unit/scene-sync.test.js`:

```js
it('uses a translucent blueprint material while editing', () => {
  const group = createBuildingMesh(barBuilding, { preview: true });
  const solid = group.children.find(child => child.userData.kind === 'building-solid');

  expect(solid.material.transparent).toBe(true);
  expect(solid.material.opacity).toBeLessThan(1);
  expect(group.userData.preview).toBe(true);
});

it('rebuilds when preview state changes without a revision change', () => {
  const rebuild = vi.fn((building, options) => ({ building, options }));
  const sync = createSceneSynchronizer({
    rebuild,
    attach: vi.fn(),
    detach: vi.fn()
  });

  sync.update([barBuilding], { previewBuildingId: null });
  sync.update([barBuilding], { previewBuildingId: 'building-a' });

  expect(rebuild).toHaveBeenCalledTimes(2);
  expect(rebuild.mock.calls[1][1]).toEqual({ preview: true });
});
```

```js
// tests/unit/sun-lighting.test.js
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applySunLighting } from '../../src/scene/sunLighting.js';

describe('sun lighting', () => {
  it('positions a visible shadow-casting light from solar direction', () => {
    const light = new THREE.DirectionalLight();
    applySunLighting(light, {
      aboveHorizon: true,
      altitudeDeg: 32,
      direction: { x: 0.4, y: 0.8, z: -0.2 }
    });

    expect(light.visible).toBe(true);
    expect(light.castShadow).toBe(true);
    expect(light.position.length()).toBeCloseTo(180);
    expect(light.position.x).toBeGreaterThan(0);
  });

  it('turns direct light and shadows off below the horizon', () => {
    const light = new THREE.DirectionalLight();
    applySunLighting(light, {
      aboveHorizon: false,
      altitudeDeg: -4,
      direction: { x: 0, y: -0.1, z: 1 }
    });

    expect(light.visible).toBe(false);
    expect(light.castShadow).toBe(false);
  });
});
```

- [ ] **Step 2: Run scene tests and verify the new assertions fail**

Run:

```powershell
npm test -- tests/unit/scene-sync.test.js tests/unit/sun-lighting.test.js
```

Expected: FAIL because preview options and `sunLighting.js` do not exist.

- [ ] **Step 3: Implement the sandbox helpers and sunlight adapter**

```js
// src/scene/sandboxAids.js
import * as THREE from 'three';

export function createSandboxAids({ size = 800, cellSize = 10 } = {}) {
  const group = new THREE.Group();
  group.name = 'sandbox-aids';
  group.userData.kind = 'sandbox-aids';

  const grid = new THREE.GridHelper(
    size,
    size / cellSize,
    0x6f8792,
    0x9faeb2
  );
  grid.name = 'ten-meter-grid';
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.34;
  grid.userData.nonPickable = true;

  const origin = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshBasicMaterial({ color: 0x24495a, depthWrite: false })
  );
  origin.name = 'coordinate-origin';
  origin.rotation.x = -Math.PI / 2;
  origin.position.y = 0.03;
  origin.userData.nonPickable = true;

  group.add(grid, origin);
  return group;
}
```

```js
// src/scene/sunLighting.js
const SUN_DISTANCE = 180;

export function applySunLighting(light, solar) {
  if (!solar.aboveHorizon) {
    light.visible = false;
    light.castShadow = false;
    return;
  }
  light.visible = true;
  light.castShadow = true;
  light.intensity = 3.2;
  light.position.set(
    solar.direction.x * SUN_DISTANCE,
    solar.direction.y * SUN_DISTANCE,
    solar.direction.z * SUN_DISTANCE
  );
  light.target.position.set(0, 0, 0);
  light.target.updateMatrixWorld();
  light.shadow.needsUpdate = true;
}
```

In `createScene.js`, create and add the aids after the ground:

```js
const aids = createSandboxAids();
scene.add(aids);
```

Return `aids` with the existing scene parts.

- [ ] **Step 4: Add blueprint rendering and preview-aware scene synchronization**

Add a second material to `buildingMesh.js`:

```js
const blueprintMaterial = new THREE.MeshStandardMaterial({
  color: 0x35bfff,
  emissive: 0x0e668f,
  emissiveIntensity: 0.32,
  roughness: 0.36,
  metalness: 0.08,
  transparent: true,
  opacity: 0.42,
  depthWrite: false
});
```

Change the factory signature and solid creation:

```js
export function createBuildingMesh(building, { preview = false } = {}) {
  // keep the existing footprint and geometry creation
  const solid = new THREE.Mesh(
    geometry,
    preview ? blueprintMaterial : buildingMaterial
  );
  solid.castShadow = !preview;
  solid.receiveShadow = !preview;
  solid.userData.kind = 'building-solid';
  solid.userData.entityId = building.id;

  // keep group transforms and floor lines
  group.userData.preview = preview;
  return group;
}
```

Change `createSceneSynchronizer.update` to include preview in its cache signature:

```js
update(buildings, { previewBuildingId = null } = {}) {
  const incomingIds = new Set(buildings.map(building => building.id));
  for (const id of objects.keys()) {
    if (!incomingIds.has(id)) remove(id);
  }
  for (const building of buildings) {
    const preview = building.id === previewBuildingId;
    const signature = `${building.revision ?? 0}:${preview}`;
    const current = objects.get(building.id);
    if (current?.signature === signature) continue;
    if (current) remove(building.id);
    const object = rebuild(building, { preview });
    objects.set(building.id, { signature, object });
    attach(object);
  }
}
```

- [ ] **Step 5: Wire solar state, scene selection, and diagnostics**

Change `createSceneController` to accept a selection callback and to expose separate project and solar updates:

```js
export function createSceneController(canvas, { onSelect = () => {} } = {}) {
  // keep renderer, camera, scene, observer, and animation loop setup
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function selectAtPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const ndc = pointerToNdc(event, rect);
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, cameraParts.camera);
    const intersections = raycaster.intersectObjects(sceneParts.buildings.children, true);
    const entityId = resolvePickedEntity(intersections);
    if (entityId) onSelect(entityId);
  }

  canvas.addEventListener('click', selectAtPointer);

  return {
    updateProject(project) {
      synchronizer.update(project.buildings, {
        previewBuildingId: project.view.editingBuildingId
      });
      canvas.dataset.buildingCount = String(project.buildings.length);
      canvas.dataset.editingBuildingId = project.view.editingBuildingId ?? '';
    },
    updateSolar(simulationState) {
      applySunLighting(sceneParts.sunlight, simulationState.solar);
      const direction = simulationState.solar.direction;
      canvas.dataset.sunDirection = [direction.x, direction.y, direction.z]
        .map(value => value.toFixed(4))
        .join(',');
      canvas.dataset.sunAboveHorizon = String(simulationState.solar.aboveHorizon);
    },
    setPreviewing(value) {
      quality.setPreviewing(value);
      resize();
    },
    dispose() {
      canvas.removeEventListener('click', selectAtPointer);
      observer.disconnect();
      rendererParts.renderer.setAnimationLoop(null);
      synchronizer.dispose();
      cameraParts.dispose();
      rendererParts.dispose();
    }
  };
}
```

Add imports for `pointerToNdc`, `resolvePickedEntity`, and `applySunLighting`.

- [ ] **Step 6: Run the scene tests**

Run:

```powershell
npm test -- tests/unit/scene-sync.test.js tests/unit/sun-lighting.test.js tests/unit/picking.test.js
```

Expected: PASS, including the preview transition and night-light tests.

- [ ] **Step 7: Commit the Three.js slice**

```powershell
git add src/scene/sandboxAids.js src/scene/sunLighting.js src/scene/createScene.js src/scene/buildingMesh.js src/scene/syncScene.js src/scene/createSceneController.js tests/unit/scene-sync.test.js tests/unit/sun-lighting.test.js
git commit -m "feat: add sandbox blueprint and live sunlight"
```

---

### Task 4: Dynamic project tree and inline building inspector

**Files:**
- Create: `src/features/buildings/BuildingInspector.js`
- Modify: `src/features/shell/DesktopShell.js`
- Modify: `src/styles/controls.css`
- Modify: `src/styles/editors.css`
- Test: `tests/unit/building-commands.test.js`

- [ ] **Step 1: Add failing DOM-free helper tests for field validation**

Add these imports and tests to `tests/unit/building-commands.test.js`:

```js
import {
  parseBuildingNumber,
  validateBuildingField
} from '../../src/features/buildings/BuildingInspector.js';

describe('building inspector values', () => {
  it('accepts finite coordinates and positive dimensions', () => {
    expect(parseBuildingNumber('12.5')).toBe(12.5);
    expect(validateBuildingField('x', -120.5)).toBe('');
    expect(validateBuildingField('length', 60)).toBe('');
    expect(validateBuildingField('floors', 33)).toBe('');
  });

  it('rejects invalid dimensions without inventing a value', () => {
    expect(parseBuildingNumber('')).toBeNull();
    expect(validateBuildingField('length', 0)).toBe('长度必须大于 0');
    expect(validateBuildingField('floors', 2.5)).toBe('楼层数必须是整数');
  });
});
```

- [ ] **Step 2: Run the helper tests and verify the inspector module is missing**

Run:

```powershell
npm test -- tests/unit/building-commands.test.js
```

Expected: FAIL because `BuildingInspector.js` does not exist.

- [ ] **Step 3: Implement exported parsing and validation helpers**

Start `src/features/buildings/BuildingInspector.js` with:

```js
import { BUILDING_TEMPLATES } from '../../domain/buildings/templates.js';
import { scenePositionToEditor } from '../../domain/buildings/editorCoordinates.js';
import {
  createCancelAddedBuildingCommand,
  createFinishBuildingCommand,
  createRemoveBuildingCommand,
  createUpdateBuildingCommand
} from '../../store/buildingCommands.js';
import { createElement } from '../../ui/createElement.js';

export function parseBuildingNumber(value) {
  if (String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function validateBuildingField(field, value) {
  if (value == null || !Number.isFinite(value)) return '请输入有效数字';
  if (field === 'floors' && !Number.isInteger(value)) return '楼层数必须是整数';
  if (['length', 'depth', 'floorHeight', 'floors'].includes(field) && value <= 0) {
    const label = {
      length: '长度',
      depth: '进深',
      floorHeight: '层高',
      floors: '楼层数'
    }[field];
    return `${label}必须大于 0`;
  }
  return '';
}
```

- [ ] **Step 4: Implement the live inspector factory**

Complete `BuildingInspector.js` with a `createBuildingInspector({ store, confirmDelete })` export. Its number field must preserve invalid text locally and only execute a command for valid values:

```js
function numberField({ label, field, value, onValid }) {
  const input = createElement('input', {
    className: 'input',
    attributes: {
      type: 'number',
      value: String(value),
      step: field === 'floors' ? '1' : '0.1',
      'aria-label': label
    }
  });
  const error = createElement('span', {
    className: 'field__error',
    attributes: { 'aria-live': 'polite' }
  });
  input.addEventListener('input', () => {
    const parsed = parseBuildingNumber(input.value);
    const message = validateBuildingField(field, parsed);
    error.textContent = message;
    input.setAttribute('aria-invalid', String(Boolean(message)));
    if (!message) onValid(parsed);
  });
  return createElement(
    'label',
    { className: 'field' },
    createElement('span', { className: 'field__label', text: label }),
    input,
    error
  );
}
```

The exported factory must:

```js
export function createBuildingInspector({
  store,
  confirmDelete = () => true
}) {
  const element = createElement('aside', {
    className: 'inspector panel building-inspector',
    testId: 'building-inspector'
  });
  let renderedId = null;

  function updateBuilding(buildingId, patch) {
    store.execute(createUpdateBuildingCommand(buildingId, patch));
  }

  function render(project) {
    const building = project.buildings.find(
      item => item.id === project.view.selectedBuildingId
    );
    element.hidden = !building;
    if (!building || renderedId === building.id) return;
    renderedId = building.id;
    const editorPosition = scenePositionToEditor(building.position);
    const template = createElement('select', {
      className: 'input',
      attributes: { 'aria-label': '建筑类型' }
    });
    for (const [value, definition] of Object.entries(BUILDING_TEMPLATES)) {
      template.append(createElement('option', {
        text: definition.label,
        attributes: { value, selected: value === building.template ? '' : null }
      }));
    }
    template.addEventListener('change', () => {
      updateBuilding(building.id, { template: template.value });
      renderedId = null;
      render(store.getState());
    });

    const finish = createElement('button', {
      className: 'button button--primary',
      text: '完成建筑',
      attributes: { type: 'button', 'data-primary-control': '' }
    });
    finish.addEventListener('click', () => {
      store.execute(createFinishBuildingCommand(building.id));
    });

    const remove = createElement('button', {
      className: 'button button--danger',
      text: project.view.addingBuildingId === building.id ? '取消本次添加' : '删除建筑',
      attributes: { type: 'button' }
    });
    remove.addEventListener('click', () => {
      if (project.view.addingBuildingId === building.id) {
        store.execute(createCancelAddedBuildingCommand(building.id));
      } else if (confirmDelete(building)) {
        store.execute(createRemoveBuildingCommand(building.id));
      }
    });

    element.replaceChildren(
      createElement('div', { className: 'panel__label', text: '建筑蓝图' }),
      createElement('h2', { className: 'panel__title', text: building.name }),
      createElement(
        'label',
        { className: 'field' },
        createElement('span', { className: 'field__label', text: '建筑类型' }),
        template
      ),
      createElement(
        'div',
        { className: 'coordinate-fields' },
        numberField({
          label: 'X 坐标（东为正）',
          field: 'x',
          value: editorPosition.x,
          onValid: x => updateBuilding(building.id, {
            position: { ...building.position, x }
          })
        }),
        numberField({
          label: 'Y 坐标（北为正）',
          field: 'y',
          value: editorPosition.y,
          onValid: y => updateBuilding(building.id, {
            position: { ...building.position, z: y }
          })
        })
      ),
      numberField({
        label: '建筑长度（米）',
        field: 'length',
        value: building.params.length,
        onValid: length => updateBuilding(building.id, { params: { length } })
      }),
      numberField({
        label: '建筑进深（米）',
        field: 'depth',
        value: building.params.depth,
        onValid: depth => updateBuilding(building.id, { params: { depth } })
      }),
      numberField({
        label: '楼层数',
        field: 'floors',
        value: building.params.floors,
        onValid: floors => updateBuilding(building.id, { params: { floors } })
      }),
      numberField({
        label: '标准层高（米）',
        field: 'floorHeight',
        value: building.params.floorHeight,
        onValid: floorHeight => updateBuilding(building.id, { params: { floorHeight } })
      }),
      numberField({
        label: '旋转角度（顺时针）',
        field: 'rotation',
        value: building.rotation,
        onValid: rotation => updateBuilding(building.id, { rotation })
      }),
      createElement('div', { className: 'inspector-actions' }, finish, remove)
    );
  }

  store.subscribe(project => {
    const selectedId = project.view.selectedBuildingId;
    if (selectedId !== renderedId || !selectedId) render(project);
  });
  render(store.getState());
  return element;
}
```

When template changes, pass template defaults in the patch instead of retaining invalid template-specific dimensions. Use the same defaults defined in Task 1.

- [ ] **Step 5: Replace the static tree with a store-driven tree**

Replace `createProjectTree` in `DesktopShell.js` with:

```js
export function createProjectTree({ store, onAdd }) {
  const list = createElement('div', { className: 'tree-list' });
  const add = createElement('button', {
    className: 'button button--primary panel__action',
    text: '＋ 添加建筑',
    attributes: {
      type: 'button',
      'data-action': 'add-building',
      'data-primary-control': ''
    }
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
    if (project.buildings.length === 0) {
      list.replaceChildren(createElement('p', {
        className: 'tree-empty',
        text: '暂无建筑。添加后可在这里选择和编辑。'
      }));
      return;
    }
    list.replaceChildren(...project.buildings.map(building => {
      const selected = building.id === project.view.selectedBuildingId;
      const row = treeRow(
        `▾ ${building.name}`,
        selected ? 'is-active' : '',
        `building-tree-${building.id}`
      );
      row.addEventListener('click', () => {
        store.execute(createSelectBuildingCommand(building.id, { editing: true }));
      });
      return row;
    }));
  }

  store.subscribe(render);
  render(store.getState());
  return element;
}
```

Import `createSelectBuildingCommand`.

- [ ] **Step 6: Add inspector and tree styles**

Add to `src/styles/editors.css`:

```css
.building-inspector[hidden] {
  display: none;
}

.coordinate-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: #e8f3f7;
}

.field__error {
  min-height: 16px;
  color: #a83c34;
  font-size: 10px;
}

.input[aria-invalid="true"] {
  border-color: #c5534a;
}

.inspector-actions {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}
```

Add to `src/styles/controls.css`:

```css
.button--danger {
  border: 1px solid #e2b8b3;
  background: #fff7f6;
  color: #963a34;
}

.tree-empty {
  padding: 18px 10px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  color: var(--ink-600);
  font-size: 11px;
  line-height: 1.6;
}
```

- [ ] **Step 7: Run the building tests**

Run:

```powershell
npm test -- tests/unit/building-commands.test.js tests/unit/buildings.test.js
```

Expected: PASS, including invalid-input behavior.

- [ ] **Step 8: Commit the inline editor slice**

```powershell
git add src/features/buildings/BuildingInspector.js src/features/shell/DesktopShell.js src/styles/controls.css src/styles/editors.css tests/unit/building-commands.test.js
git commit -m "feat: add inline building blueprint editor"
```

---

### Task 5: Dual date/time timeline

**Files:**
- Modify: `src/features/timeline/Timeline.js`
- Modify: `src/styles/simulation.css`
- Modify: `src/styles/layout.css`
- Test: `tests/unit/date-range.test.js`

- [ ] **Step 1: Add a failing playback stop assertion**

Append to `tests/unit/date-range.test.js`:

```js
import { vi } from 'vitest';
import { createPlayback } from '../../src/features/timeline/usePlayback.js';

it('stops an active playback when requested', () => {
  vi.useFakeTimers();
  let value = 0;
  const playback = createPlayback({
    read: () => value,
    write: next => { value = next; },
    min: 0,
    max: 4,
    intervalMs: 100
  });
  playback.toggle();
  playback.stop();
  vi.advanceTimersByTime(300);
  expect(value).toBe(0);
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run the date-range test**

Run:

```powershell
npm test -- tests/unit/date-range.test.js
```

Expected: PASS if Task 2 is correct; if it fails, fix `stop()` before proceeding.

- [ ] **Step 3: Replace the single timeline with two independent rows**

Replace `Timeline.js` with:

```js
import { getDaylightWindow } from '../../domain/solar/getDaylightWindow.js';
import { createElement } from '../../ui/createElement.js';
import { minuteToTime } from '../results/createSimulationController.js';
import {
  dateToDayIndex,
  dayIndexToDate,
  daysInDateYear
} from './dateRange.js';
import { createPlayback } from './usePlayback.js';

function playButton(label, playback) {
  const button = createElement('button', {
    className: 'timeline__play',
    text: '▶',
    attributes: {
      type: 'button',
      'aria-label': label,
      'data-primary-control': ''
    }
  });
  button.addEventListener('click', () => {
    const playing = playback.toggle();
    button.textContent = playing ? 'Ⅱ' : '▶';
    button.setAttribute('aria-label', playing ? `暂停${label}` : label);
  });
  return button;
}

export function createTimeline(controller) {
  let state = controller.getState();
  const dateRange = createElement('input', {
    className: 'timeline__range timeline__range--date',
    attributes: { type: 'range', min: '0', step: '1', 'aria-label': '全年日期轴' }
  });
  const dateInput = createElement('input', {
    className: 'timeline__date-input',
    attributes: { type: 'date', 'aria-label': '日期' }
  });
  const timeRange = createElement('input', {
    className: 'timeline__range timeline__range--time',
    attributes: { type: 'range', step: '1', 'aria-label': '一天时间轴' }
  });
  const timeInput = createElement('input', {
    className: 'timeline__time-input',
    attributes: { type: 'time', 'aria-label': '时间' }
  });

  const datePlayback = createPlayback({
    read: () => dateToDayIndex(controller.getState().date),
    write: index => controller.setDate(dayIndexToDate(controller.getState().date, index)),
    min: 0,
    max: daysInDateYear(state.date) - 1,
    step: 1,
    intervalMs: 120
  });
  const timePlayback = createPlayback({
    read: () => controller.getState().minute,
    write: minute => controller.setTime(minuteToTime(minute)),
    min: 0,
    max: 1439,
    step: 5,
    intervalMs: 180
  });

  dateRange.addEventListener('input', () => {
    datePlayback.stop();
    controller.setDate(dayIndexToDate(controller.getState().date, Number(dateRange.value)));
  });
  dateInput.addEventListener('input', () => {
    if (dateInput.value) {
      datePlayback.stop();
      controller.setDate(dateInput.value);
    }
  });
  timeRange.addEventListener('input', () => {
    timePlayback.stop();
    controller.setTime(minuteToTime(Number(timeRange.value)));
  });
  timeInput.addEventListener('input', () => {
    timePlayback.stop();
    controller.setTime(timeInput.value);
  });

  controller.subscribe(next => {
    state = next;
    const daylight = getDaylightWindow({
      ...next.location,
      localDate: next.date
    });
    dateRange.max = String(daysInDateYear(next.date) - 1);
    dateRange.value = String(dateToDayIndex(next.date));
    dateInput.value = next.date;
    timeRange.min = String(daylight.sunriseMinute);
    timeRange.max = String(daylight.sunsetMinute);
    timeRange.value = String(next.minute);
    timeInput.value = next.time;
  });

  const timelineRow = ({ kind, button, range, labels, input }) => createElement(
    'section',
    { className: `timeline timeline--${kind}` },
    button,
    createElement(
      'div',
      { className: 'timeline__track-wrap' },
      createElement(
        'div',
        { className: 'timeline__labels' },
        ...labels.map(text => createElement('span', { text }))
      ),
      range
    ),
    input
  );

  const element = createElement(
    'div',
    { className: 'timeline-stack' },
    timelineRow({
      kind: 'date',
      button: playButton('播放全年日期', datePlayback),
      range: dateRange,
      labels: ['1 月', '春分', '夏至', '秋分', '12 月'],
      input: dateInput
    }),
    timelineRow({
      kind: 'time',
      button: playButton('播放一天时间', timePlayback),
      range: timeRange,
      labels: ['日出', state.time, '日落'],
      input: timeInput
    })
  );

  return element;
}
```

After construction, trigger one update by extracting the subscription body into `render(next)` and calling `render(controller.getState())`. Do not call a private listener directly.

- [ ] **Step 4: Style two compact rows**

Replace the single-row assumptions in `simulation.css` with:

```css
.timeline-stack {
  z-index: 8;
  display: grid;
  background: rgb(255 255 255 / 94%);
}

.timeline {
  display: grid;
  min-height: 58px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 8px 22px;
  border-top: 1px solid var(--line);
}

.timeline__range {
  width: 100%;
  height: 8px;
  margin: 0;
  border-radius: 99px;
  appearance: none;
  cursor: pointer;
}

.timeline__range--date {
  background: linear-gradient(90deg, #a8cddd, #2d7da6);
}

.timeline__range--time {
  background: linear-gradient(90deg, #6b7780, var(--sun-500), #59636c);
}

.timeline__date-input,
.timeline__time-input {
  min-width: 118px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: white;
  color: var(--ink-950);
  font-weight: 700;
}
```

Remove the old `.timeline` layout block from `layout.css` so `simulation.css` is the single owner of timeline layout.

- [ ] **Step 5: Run timeline-related tests**

Run:

```powershell
npm test -- tests/unit/date-range.test.js tests/unit/simulation-controller.test.js tests/unit/solar.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit the timeline slice**

```powershell
git add src/features/timeline/Timeline.js src/styles/simulation.css src/styles/layout.css tests/unit/date-range.test.js
git commit -m "feat: add independent date and time playback"
```

---

### Task 6: Compose the store-driven application and persistence

**Files:**
- Modify: `src/features/results/ResultsPanel.js`
- Modify: `src/features/shell/AppShell.js`
- Modify: `src/features/shell/MobileShell.js`
- Modify: `src/main.js`
- Modify: `src/styles/layout.css`
- Modify: `src/styles/project.css`
- Test: `tests/unit/smoke.test.js`

- [ ] **Step 1: Update the smoke test to describe the new shell**

Replace the shell assertion in `tests/unit/smoke.test.js` with:

```js
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../src/main.js';
import { createDefaultProject } from '../../src/domain/project/defaultProject.js';

describe('application defaults', () => {
  it('starts as an empty persistent sandbox', () => {
    const project = createDefaultProject();
    expect(APP_NAME).toBe('日照 · 住宅采光模拟器');
    expect(project.buildings).toEqual([]);
    expect(project.view.selectedBuildingId).toBeNull();
    expect(project.view.editingBuildingId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the smoke test**

Run:

```powershell
npm test -- tests/unit/smoke.test.js
```

Expected: PASS after Task 1; this protects the empty default before shell wiring.

- [ ] **Step 3: Make results embeddable and compose real panels**

Change `createResultsPanel` to return a `<section>` without the outer `.inspector` grid responsibility:

```js
const element = createElement(
  'section',
  { className: 'results-panel', testId: 'results-panel' },
  // keep existing result children
);
```

Change `createAppShell` to accept dependencies:

```js
export function createAppShell({
  store,
  simulationController,
  onAddBuilding,
  onClearSandbox,
  confirmDeleteBuilding
}) {
  const { sheet, navigation } = createMobileControls();
  const projectTree = createProjectTree({ store, onAdd: onAddBuilding });
  const buildingInspector = createBuildingInspector({
    store,
    confirmDelete: confirmDeleteBuilding
  });
  const resultsPanel = createResultsPanel(simulationController);
  const inspectorHost = createElement(
    'aside',
    { className: 'inspector-host panel', testId: 'inspector' },
    buildingInspector,
    resultsPanel
  );

  function updateInspector(project) {
    const hasSelection = Boolean(project.view.selectedBuildingId);
    buildingInspector.hidden = !hasSelection;
    resultsPanel.hidden = hasSelection;
  }
  store.subscribe(updateInspector);
  updateInspector(store.getState());

  return createElement(
    'div',
    { className: 'app-shell' },
    createHeader({ onClearSandbox }),
    createElement(
      'div',
      { className: 'workspace' },
      projectTree,
      createViewport(),
      inspectorHost,
      sheet
    ),
    createTimeline(simulationController),
    navigation
  );
}
```

Change `createHeader` to include “清空沙盘” and remove “新建项目”. Change `createViewport` to:

```js
function createViewport() {
  return createElement(
    'main',
    { className: 'viewport' },
    createElement('canvas', {
      className: 'scene-canvas',
      attributes: { id: 'scene-canvas', 'aria-label': '三维采光场景' }
    }),
    createElement(
      'div',
      { className: 'viewport__compass', attributes: { 'aria-label': '北向指南针' } },
      createElement('strong', { text: 'N' }),
      createElement('span', { text: '▲' })
    ),
    createElement('div', {
      className: 'viewport__scale',
      text: '每格 10 米',
      testId: 'grid-scale'
    }),
    createElement('div', {
      className: 'viewport__empty',
      text: '点击左侧“添加建筑”开始布置',
      testId: 'empty-sandbox-hint'
    })
  );
}
```

- [ ] **Step 4: Replace `mountApp` with one store and explicit wiring**

At the top of `main.js`, remove wizard imports and add:

```js
import { createStore } from './store/createStore.js';
import {
  createAddBuildingCommand,
  createClearBuildingsCommand,
  createRemoveBuildingCommand,
  createSelectBuildingCommand
} from './store/buildingCommands.js';
import { createSimulationController } from './features/results/createSimulationController.js';
```

Replace `mountApp` with this control flow:

```js
export function mountApp(root) {
  const store = createStore(loadDraft() ?? createDefaultProject());
  const simulationController = createSimulationController(store);
  let sceneController = null;
  let saveTimer = null;

  function scheduleSave(project) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        saveDraft(project);
      } catch {
        showToast('无法保存本机草稿，请检查浏览器存储空间。', 'error');
      }
    }, 300);
  }

  function addBuilding() {
    store.execute(createAddBuildingCommand());
  }

  function clearSandbox() {
    if (globalThis.confirm('清空后将删除所有建筑、观察区和窗户。确定继续吗？')) {
      store.execute(createClearBuildingsCommand());
      saveDraft(store.getState());
    }
  }

  const shell = createAppShell({
    store,
    simulationController,
    onAddBuilding: addBuilding,
    onClearSandbox: clearSandbox,
    confirmDeleteBuilding: building => globalThis.confirm(
      `确定删除“${building.name}”及其观察区和窗户吗？`
    )
  });
  root.replaceChildren(shell);

  const canvas = shell.querySelector('#scene-canvas');
  const sceneReady = supportsWebGL()
    ? import('./scene/createSceneController.js').then(({ createSceneController }) => {
        sceneController = createSceneController(canvas, {
          onSelect: buildingId => {
            store.execute(createSelectBuildingCommand(buildingId, { editing: true }));
          }
        });
        sceneController.updateProject(store.getState());
        sceneController.updateSolar(simulationController.getState());
        return sceneController;
      })
    : Promise.resolve(null);
  if (!supportsWebGL()) canvas.parentElement.append(createWebGLFallback());

  store.subscribe(project => {
    scheduleSave(project);
    shell.dataset.projectBuildings = String(project.buildings.length);
    shell.querySelector('.viewport__empty').hidden = project.buildings.length > 0;
    if (sceneController) sceneController.updateProject(project);
    else sceneReady.then(controller => controller?.updateProject(project));
  });
  simulationController.subscribe(state => {
    if (sceneController) sceneController.updateSolar(state);
    else sceneReady.then(controller => controller?.updateSolar(state));
  });

  // Keep existing import, export, and screenshot handlers, but replace queueDraft
  // with store.replaceProject and read date/time from store.getState().
}
```

Call `supportsWebGL()` only once and store the result in `webglAvailable`. Retain the existing import/export/screenshot elements and handlers, replacing `currentProject` with `store.getState()` and `queueDraft(project)` with `store.replaceProject(project)`.

Remove the `open-example` listener and all wizard creation.

- [ ] **Step 5: Add shell and empty-sandbox styling**

In `layout.css`:

```css
.viewport__compass {
  position: absolute;
  top: 16px;
  right: 16px;
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border: 2px solid var(--ink-800);
  border-radius: 50%;
  background: rgb(255 255 255 / 82%);
  color: #b43e36;
  pointer-events: none;
}

.viewport__compass strong {
  position: absolute;
  top: 5px;
  font-size: 11px;
}

.viewport__compass span {
  transform: translateY(-5px);
}

.viewport__scale {
  position: absolute;
  bottom: 14px;
  left: 14px;
  padding: 6px 9px;
  border-radius: 8px;
  background: rgb(255 255 255 / 82%);
  color: var(--ink-800);
  font-size: 10px;
  font-weight: 700;
  pointer-events: none;
}

.viewport__empty {
  inset: auto auto 18px 50%;
  padding: 8px 11px;
  border-radius: 9px;
  background: rgb(255 255 255 / 76%);
  color: var(--ink-600);
  font-size: 11px;
  transform: translateX(-50%);
}
```

Remove `.viewport__example` styles and the large heading styles for the old blocking empty state.

- [ ] **Step 6: Update mobile controls to expose the editor**

Change the tab definitions in `MobileShell.js` to:

```js
const TABS = [
  ['场景', '场景对象', 'buildings'],
  ['建筑', '建筑参数', 'editor'],
  ['模拟', '日期与时间', 'simulation'],
  ['结果', '分析结果', 'results']
];
```

On click, set `document.querySelector('.app-shell').dataset.mobilePanel = panel`. In mobile CSS, show the project tree for `buildings`, inspector host for `editor` and `results`, and timeline stack for `simulation`. Keep all visible primary controls at least 44 px.

- [ ] **Step 7: Run the complete unit suite**

Run:

```powershell
npm test
```

Expected: all unit test files pass with 0 failures.

- [ ] **Step 8: Commit the application wiring**

```powershell
git add src/features/results/ResultsPanel.js src/features/shell/AppShell.js src/features/shell/MobileShell.js src/main.js src/styles/layout.css src/styles/project.css tests/unit/smoke.test.js
git commit -m "feat: replace project wizard with persistent sandbox"
```

---

### Task 7: End-to-end regression coverage

**Files:**
- Create: `tests/e2e/sandbox-editor.spec.js`
- Modify: `tests/e2e/example-project.spec.js`
- Modify: `tests/e2e/wizard-building.spec.js`
- Modify: `tests/e2e/simulation.spec.js`
- Modify: `tests/e2e/responsive-shell.spec.js`
- Modify: `tests/e2e/accessibility-performance.spec.js`

- [ ] **Step 1: Replace example-first tests with empty-sandbox tests**

Delete the old example-opening assertion from `tests/e2e/example-project.spec.js` and replace it with:

```js
import { expect, test } from '@playwright/test';

test('opens as an empty sandbox without an example overlay', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByTestId('empty-sandbox-hint')).toBeVisible();
  await expect(page.getByTestId('grid-scale')).toHaveText('每格 10 米');
  await expect(page.getByLabel('北向指南针')).toBeVisible();
  await expect(page.getByRole('button', { name: '打开示例项目' })).toHaveCount(0);
  await expect(page.getByLabel('三维采光场景')).toHaveAttribute('data-building-count', '0');
});
```

- [ ] **Step 2: Add the full sandbox editor flow**

```js
// tests/e2e/sandbox-editor.spec.js
import { expect, test } from '@playwright/test';

test('previews, persists, reselects, and clears a coordinate-positioned building', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();

  const canvas = page.getByLabel('三维采光场景');
  await expect(canvas).toHaveAttribute('data-building-count', '1');
  await expect(canvas).not.toHaveAttribute('data-editing-building-id', '');

  await page.getByLabel('X 坐标（东为正）').fill('28');
  await page.getByLabel('Y 坐标（北为正）').fill('38');
  await page.getByLabel('旋转角度（顺时针）').fill('15');
  await page.getByRole('button', { name: '完成建筑' }).click();
  await expect(canvas).toHaveAttribute('data-editing-building-id', '');

  await page.reload();
  await expect(canvas).toHaveAttribute('data-building-count', '1');
  await page.getByTestId(/building-tree-/).click();
  await expect(page.getByLabel('X 坐标（东为正）')).toHaveValue('28');
  await expect(page.getByLabel('Y 坐标（北为正）')).toHaveValue('38');

  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '清空沙盘' }).click();
  await expect(canvas).toHaveAttribute('data-building-count', '0');
});

test('keeps the last valid value while a numeric field is invalid', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '添加建筑' }).click();
  await page.getByLabel('建筑长度（米）').fill('0');

  await expect(page.getByText('长度必须大于 0')).toBeVisible();
  await page.getByLabel('建筑长度（米）').fill('72');
  await expect(page.getByText('长度必须大于 0')).toBeHidden();
});
```

Use a stable `data-testid="building-tree-${id}"` locator through `page.locator('[data-testid^="building-tree-"]')` if Playwright does not accept a regular expression in `getByTestId`.

- [ ] **Step 3: Rewrite the simulation flow around two sliders**

Replace `tests/e2e/simulation.spec.js` with:

```js
import { expect, test } from '@playwright/test';

test('updates sunlight for date and time while keeping the other dimension fixed', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByLabel('三维采光场景');

  await page.getByLabel('日期').fill('2026-06-21');
  await page.getByLabel('时间', { exact: true }).fill('09:30');
  const summerDirection = await canvas.getAttribute('data-sun-direction');

  await page.getByLabel('日期').fill('2026-12-21');
  await expect(page.getByLabel('时间', { exact: true })).toHaveValue('09:30');
  await expect(canvas).not.toHaveAttribute('data-sun-direction', summerDirection);

  const winterDirection = await canvas.getAttribute('data-sun-direction');
  await page.getByLabel('时间', { exact: true }).fill('14:00');
  await expect(page.getByLabel('日期')).toHaveValue('2026-12-21');
  await expect(canvas).not.toHaveAttribute('data-sun-direction', winterDirection);
});

test('shows no direct sunlight below the horizon', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('时间', { exact: true }).fill('23:00');

  await expect(page.getByLabel('三维采光场景'))
    .toHaveAttribute('data-sun-above-horizon', 'false');
  await expect(page.getByTestId('direct-sun-status')).toContainText('无直射');
});
```

- [ ] **Step 4: Update wizard and responsive tests**

Replace wizard actions in `tests/e2e/wizard-building.spec.js` with direct “添加建筑” assertions or remove the file if all behavior is covered by `sandbox-editor.spec.js`.

In `responsive-shell.spec.js`, keep the desktop/sidebar assertions and change the mobile active-tab test to:

```js
test('switches the active mobile workspace panel', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile');
  await page.goto('/');
  await page.getByRole('button', { name: '建筑' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-mobile-panel', 'editor');
});
```

In `accessibility-performance.spec.js`, replace the “新建项目” control with:

```js
await expect(page.getByRole('button', { name: '添加建筑' })).toBeVisible();
```

Keep the WebGL fallback test unchanged and change its building sync flow to use the direct add button.

- [ ] **Step 5: Run desktop E2E tests first**

Run:

```powershell
npx playwright test --project=desktop
```

Expected: all desktop tests pass. If a selector fails, inspect the rendered accessible name and change the application or test to a stable label rather than using positional selectors.

- [ ] **Step 6: Run mobile E2E tests**

Run:

```powershell
npx playwright test --project=mobile
```

Expected: all Pixel 7 tests pass and all visible primary controls meet the 44 px target.

- [ ] **Step 7: Commit the E2E coverage**

```powershell
git add tests/e2e/example-project.spec.js tests/e2e/wizard-building.spec.js tests/e2e/sandbox-editor.spec.js tests/e2e/simulation.spec.js tests/e2e/responsive-shell.spec.js tests/e2e/accessibility-performance.spec.js
git commit -m "test: cover persistent sandbox editing"
```

---

### Task 8: Documentation and final verification

**Files:**
- Modify: `README.md`
- Verify: all source and test files from Tasks 1–7

- [ ] **Step 1: Update product capabilities in the README**

Replace the current capability list with:

```markdown
## 当前能力

- 空沙盘直接添加和编辑建筑，无需完成项目向导
- 10 米参考网格、北向指南针和 X/Y 米制坐标
- 三种住宅模板与半透明蓝图实时预览
- 建筑、观察区、普通窗、落地窗和阳台开口
- 日期全年滑条与日内时间轴，可分别拖动和自动播放
- 太阳位置、场景阴影和分析结果同步更新
- 项目自动保存在本地，可导入、导出 JSON 和导出截图
- 桌面端、平板和手机端响应式界面
```

Add one sentence after the list:

```markdown
首次打开时显示空沙盘；除非主动选择“清空沙盘”，刷新页面会恢复本机草稿。
```

- [ ] **Step 2: Run all unit tests from a fresh process**

Run:

```powershell
npm test
```

Expected: exit code 0 and 0 failed tests.

- [ ] **Step 3: Run all desktop and mobile E2E tests**

Run:

```powershell
npm run test:e2e
```

Expected: exit code 0 for both `desktop` and `mobile` Playwright projects.

- [ ] **Step 4: Run the production build**

Run:

```powershell
npm run build
```

Expected: exit code 0 and a generated `dist/` bundle without chunk-size warnings above the configured 650 kB limit.

- [ ] **Step 5: Inspect the final diff and status**

Run:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` prints nothing. `git status --short` lists only the intended README change if it has not yet been committed.

- [ ] **Step 6: Commit documentation**

```powershell
git add README.md
git commit -m "docs: describe sandbox editing workflow"
```

- [ ] **Step 7: Re-run final verification after the last commit**

Run:

```powershell
npm test
npm run test:e2e
npm run build
git status --short
```

Expected: all commands exit 0 and the final status is clean.
