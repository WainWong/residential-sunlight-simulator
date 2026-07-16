# Building Type Control Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and implement this plan inline, task by task. Steps use checkbox (`- [ ]`) syntax for tracking. This worktree contains a broad in-progress room-first redesign: do not stage, commit, discard, or move existing changes.

**Goal:** Centralize building-type geometry and editable dimensions in a declarative domain module, fix courtyard type switching, and expose 4/6/8 dimension controls for bar, L-shape, and courtyard buildings.

**Architecture:** A `buildingTypes.js` registry resolves three pure adapters. Each adapter owns defaults, footprint construction, normalization, validation, and dimension-control definitions; store and scene callers use registry helpers instead of template branches. Three.js renders generic control descriptors and the scene synchronizer provides a transient mesh preview during drag without publishing intermediate store history.

**Tech Stack:** JavaScript, Three.js, Vitest, jsdom, Playwright, Vite

---

## File Map

- Create `src/domain/buildings/types/shared.js`: geometry constants, rectangle helper, outer-control factories, and parameter clamping.
- Create `src/domain/buildings/types/bar.js`: bar defaults, footprint, validation, and four outer controls.
- Create `src/domain/buildings/types/lShape.js`: L footprint, wing constraints, and six controls.
- Create `src/domain/buildings/types/courtyard.js`: courtyard footprint, wall constraints, and eight controls.
- Create `src/domain/buildings/buildingTypes.js`: registry and the public domain interface.
- Create `tests/unit/building-types.test.js`: registry, normalization, footprint, control, and extension-contract tests.
- Modify `src/domain/buildings/templates.js`: derive inspector metadata from the registry.
- Modify `src/domain/buildings/createFootprint.js`: delegate to the registry.
- Modify `src/store/projectCommands.js`: seed and switch complete template parameters.
- Modify `src/store/buildingCommands.js`: delegate legacy parameter handling to the same registry.
- Create `tests/unit/project-commands.test.js`: room-first create/update parameter behavior.
- Modify `tests/unit/building-inspector.test.js`: cover real inspector type switching.
- Modify `src/domain/project/migrateProject.js`: repair only absent template fields in existing schema-v2 drafts.
- Modify `src/domain/project/validateProject.js`: use adapter-specific validation.
- Modify `tests/unit/migrate-project.test.js` and `tests/unit/project-schema.test.js`: migration and validation regressions.
- Modify `src/scene/gizmos/buildingGizmo.js`: render generic dimension descriptors.
- Modify `src/scene/gizmos/buildingGizmoOverlay.js`: orient resize icons from `x`/`z` axes.
- Modify `tests/unit/building-gizmo.test.js` and `tests/unit/building-gizmo-overlay.test.js`: assert 4/6/8 controls and preserve overlay behavior.
- Modify `src/domain/buildings/editorCoordinates.js`: convert world ground points to building-local points.
- Modify `src/scene/gizmos/createBuildingGestures.js`: delegate dimension drag math and preview complete geometry.
- Modify `src/scene/syncScene.js`: own transient building preview lifecycle.
- Modify `src/scene/createSceneController.js`: connect gestures to transient preview methods.
- Modify `tests/unit/scene-sync.test.js`: verify preview replacement, disposal, and restoration.
- Modify `tests/e2e/sandbox-editor.spec.js`: verify template switching and total control counts.

## Public Domain Interface

All tasks use these exact names:

```js
getBuildingTypeDefinition(templateId)
listBuildingTypeDefinitions()
createBuildingParams({ currentParams, templateId, overrides })
completeMissingBuildingParams(templateId, params)
normalizeBuildingParams(templateId, params)
validateBuildingParams(templateId, params)
applyDimensionControl({ templateId, controlId, startParams, pointerLocal })
```

A dimension control has this exact shape:

```js
{
  id: 'courtyard-east',
  role: 'inner-length',
  axis: 'x',
  sign: 1,
  normal: { x: -1, z: 0 },
  anchor(params) { return { x: params.courtyardLength / 2, z: 0 }; },
  applyDrag({ startParams, pointerLocal }) { return { courtyardLength: 20 }; }
}
```

`axis` is always `x` or `z`. `normal` points from solid geometry toward the empty space where the visual handle belongs. Scene metadata stores only `controlId`, `axis`, and `sign`; it never stores adapter functions.

### Task 1: Build The Type Registry And Three Adapters

**Files:**
- Create: `src/domain/buildings/types/shared.js`
- Create: `src/domain/buildings/types/bar.js`
- Create: `src/domain/buildings/types/lShape.js`
- Create: `src/domain/buildings/types/courtyard.js`
- Create: `src/domain/buildings/buildingTypes.js`
- Create: `tests/unit/building-types.test.js`

- [x] **Step 1: Write failing registry and parameter tests**

Create tests that import the public interface and assert the following behavior:

```js
expect(listBuildingTypeDefinitions().map(type => type.id))
  .toEqual(['bar', 'lShape', 'courtyard']);

expect(createBuildingParams({
  currentParams: { length: 70, depth: 18, floors: 5, floorHeight: 3 },
  templateId: 'courtyard'
})).toEqual({
  length: 60, depth: 40,
  courtyardLength: 30, courtyardDepth: 16,
  floors: 5, floorHeight: 3
});

expect(() => getBuildingTypeDefinition('tower'))
  .toThrow('Unknown building type: tower');
```

Also assert that `completeMissingBuildingParams` fills absent fields but preserves explicit `null`, so migration cannot hide malformed imported values.

- [x] **Step 2: Write failing footprint and control tests**

For each adapter, assert that default parameters create only finite footprint coordinates. Assert control ids and counts:

```js
expect(controlIds('bar')).toEqual([
  'outer-east', 'outer-west', 'outer-north', 'outer-south'
]);
expect(controlIds('lShape')).toEqual([
  'outer-east', 'outer-west', 'outer-north', 'outer-south',
  'l-inner-vertical', 'l-inner-horizontal'
]);
expect(controlIds('courtyard')).toEqual([
  'outer-east', 'outer-west', 'outer-north', 'outer-south',
  'courtyard-east', 'courtyard-west', 'courtyard-north', 'courtyard-south'
]);
```

Test the exact L inner anchors and patches:

```js
expect(anchor('lShape', 'l-inner-vertical', lParams))
  .toEqual({ x: -12, z: 8 });
expect(applyDimensionControl({
  templateId: 'lShape', controlId: 'l-inner-vertical',
  startParams: lParams, pointerLocal: { x: -5, z: 0 }
})).toMatchObject({ wingLength: 25, wingDepth: 16 });
```

Test extreme pointer positions and assert that L missing-corner spans stay at least 2m and courtyard walls stay at least 2m thick.

- [x] **Step 3: Run Task 1 tests and verify RED**

Run:

```powershell
npx vitest run tests/unit/building-types.test.js
```

Expected: FAIL because `buildingTypes.js` and its adapters do not exist.

- [x] **Step 4: Implement shared geometry and control factories**

Implement these constants and factories in `types/shared.js`:

```js
export const MIN_BUILDING_SPAN = 2;
export const MIN_VOID_SPAN = 2;
export const MIN_WALL_THICKNESS = 2;

export const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

export function rectangle(length, depth) {
  const x = length / 2; const z = depth / 2;
  return [[-x, -z], [x, -z], [x, z], [-x, z]];
}

export function createOuterControls() {
  return [
    extentControl('outer-east', 'length', 'x', 1, { x: 1, z: 0 }),
    extentControl('outer-west', 'length', 'x', -1, { x: -1, z: 0 }),
    extentControl('outer-north', 'depth', 'z', 1, { x: 0, z: 1 }),
    extentControl('outer-south', 'depth', 'z', -1, { x: 0, z: -1 })
  ];
}
```

`extentControl` derives an outer midpoint from `length` or `depth` and returns a patch using `Math.max(MIN_BUILDING_SPAN, Math.abs(pointerLocal[axis]) * 2)`.

- [x] **Step 5: Implement adapters and registry helpers**

Implement all public names listed above. Freeze each adapter and its defaults. `createBuildingParams` must remove the union of all registered `geometryFields`, preserve all non-geometry fields, seed the destination defaults, apply defined overrides, and normalize once.

Implement L inner drag formulas:

```js
wingLength = clamp(pointerLocal.x + startParams.length / 2, 2, startParams.length - 2);
wingDepth = clamp(pointerLocal.z + startParams.depth / 2, 2, startParams.depth - 2);
```

Implement courtyard inner formulas with centered dimensions:

```js
courtyardLength = clamp(Math.abs(pointerLocal.x) * 2, 2, startParams.length - 4);
courtyardDepth = clamp(Math.abs(pointerLocal.z) * 2, 2, startParams.depth - 4);
```

After applying a control patch, call the selected adapter's `normalizeParams` and return the complete normalized parameter object.

- [x] **Step 6: Run Task 1 tests and verify GREEN**

Run:

```powershell
npx vitest run tests/unit/building-types.test.js
```

Expected: PASS with the three adapters, finite footprints, exact control ids, and constraint tests green.

### Task 2: Route Footprints, Commands, And Inspector Through The Registry

**Files:**
- Modify: `src/domain/buildings/templates.js`
- Modify: `src/domain/buildings/createFootprint.js`
- Modify: `src/store/projectCommands.js`
- Modify: `src/store/buildingCommands.js`
- Create: `tests/unit/project-commands.test.js`
- Modify: `tests/unit/building-commands.test.js`
- Modify: `tests/unit/building-inspector.test.js`

- [x] **Step 1: Write the failing room-first command regression**

Add tests using `src/store/projectCommands.js`:

```js
const added = createAddBuildingCommand({ id: 'b1', template: 'lShape' })
  .apply(createDefaultProject());
expect(added.buildings[0].params).toMatchObject({
  length: 60, depth: 40, wingLength: 18, wingDepth: 16,
  floors: 10, floorHeight: 3
});

const switched = createUpdateBuildingCommand('b1', { template: 'courtyard' })
  .apply(createAddBuildingCommand({ id: 'b1' }).apply(createDefaultProject()));
expect(switched.buildings[0].params).toEqual({
  length: 60, depth: 40,
  courtyardLength: 30, courtyardDepth: 16,
  floors: 10, floorHeight: 3
});
```

Assert that switching preserves `firstFloorHeight` and an unrelated non-geometry value, while removing `wingLength` and `wingDepth`.

- [x] **Step 2: Write the failing inspector regression**

Mount `BuildingInspector`, add a bar building, select the `courtyard` option, dispatch `change`, and assert the store contains finite courtyard parameters and `createFootprint` contains four finite hole points.

- [x] **Step 3: Run Task 2 tests and verify RED**

Run:

```powershell
npx vitest run tests/unit/project-commands.test.js tests/unit/building-inspector.test.js
```

Expected: FAIL because the active room-first command still seeds bar defaults and merges stale parameters.

- [x] **Step 4: Delegate metadata and footprints**

Build `BUILDING_TEMPLATES` from `listBuildingTypeDefinitions()` and their `label` and `geometryFields`. Replace `createFootprint.js` template branches with:

```js
export function createFootprint(template, params) {
  return getBuildingTypeDefinition(template).createFootprint(params);
}
```

- [x] **Step 5: Delegate both command paths**

In both command modules:

- use `createBuildingParams` when adding or changing template;
- use `normalizeBuildingParams` when applying a same-template geometry patch;
- keep each module's existing view-state behavior unchanged;
- export `BUILDING_DEFAULTS` from the registry compatibility surface only while legacy tests depend on that name;
- reject unsupported template ids without publishing a partial building.

Do not merge the room-first and legacy view state machines in this feature.

- [x] **Step 6: Run Task 2 tests and existing footprint tests**

Run:

```powershell
npx vitest run tests/unit/project-commands.test.js tests/unit/building-inspector.test.js tests/unit/building-commands.test.js tests/unit/buildings.test.js
```

Expected: PASS. The inspector switch creates a real courtyard footprint and both command adapters share domain parameter behavior.

### Task 3: Repair Known Drafts And Validate Template Invariants

**Files:**
- Modify: `src/domain/project/migrateProject.js`
- Modify: `src/domain/project/validateProject.js`
- Modify: `tests/unit/migrate-project.test.js`
- Modify: `tests/unit/project-schema.test.js`

- [x] **Step 1: Write failing migration and validation tests**

Add a schema-v2 courtyard fixture whose params contain only `length`, `depth`, `floors`, and `floorHeight`. Assert migration fills `courtyardLength` and `courtyardDepth` from defaults without changing existing fields.

Add a second fixture with `courtyardLength: null`; assert migration preserves `null` and validation rejects it. Add L and courtyard cross-parameter failures:

```js
expect(validateBuildingParams('lShape', {
  length: 20, depth: 20, wingLength: 20, wingDepth: 8
})).not.toEqual([]);
expect(validateBuildingParams('courtyard', {
  length: 20, depth: 20, courtyardLength: 18, courtyardDepth: 10
})).not.toEqual([]);
```

- [x] **Step 2: Run Task 3 tests and verify RED**

Run:

```powershell
npx vitest run tests/unit/migrate-project.test.js tests/unit/project-schema.test.js
```

Expected: FAIL because migration does not complete missing geometry fields and validation checks only outer dimensions.

- [x] **Step 3: Implement migration repair and delegated validation**

During `normalizeV2`, replace each building's params with `completeMissingBuildingParams(building.template, building.params)`. The helper fills only fields for which `Object.hasOwn(params, field)` is false.

After common building checks, call `validateBuildingParams(building.template, params)` and prefix each returned issue with the building label. Keep common floors, heights, position, and rotation checks in `validateProject.js`.

- [x] **Step 4: Run Task 3 tests and import/local-draft tests**

Run:

```powershell
npx vitest run tests/unit/migrate-project.test.js tests/unit/project-schema.test.js tests/unit/project-files.test.js
```


Expected: known missing-field drafts survive with defaults; explicit invalid values and impossible shapes fail validation.

### Task 4: Render Generic 4/6/8 Dimension Controls

**Files:**
- Modify: `src/scene/gizmos/buildingGizmo.js`
- Modify: `src/scene/gizmos/buildingGizmoOverlay.js`
- Modify: `tests/unit/building-gizmo.test.js`
- Modify: `tests/unit/building-gizmo-overlay.test.js`

- [x] **Step 1: Replace rectangular gizmo expectations with type-driven contracts**

Add a parameterized test that creates all three building types and asserts resize anchor and hit-target counts of 4, 6, and 8. Assert every hit target contains:

```js
{
  type: 'resize',
  buildingId: building.id,
  controlId: expectedId,
  axis: 'x' // or 'z'
}
```

Assert the L inner anchors lie beside the missing corner and courtyard inner anchors lie inside the courtyard. Preserve the existing rotation-ring spacing, occlusion, and hit-target tests.

- [x] **Step 2: Run gizmo tests and verify RED**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js tests/unit/building-gizmo-overlay.test.js
```

Expected: FAIL because every template still produces four hard-coded rectangular controls and uses `length`/`depth` axis names.

- [x] **Step 3: Render controls returned by the adapter**

In `createBuildingGizmo`:

1. resolve the building definition;
2. compute ring radius from every outer footprint point rather than template branches;
3. call `definition.getDimensionControls(building.params)`;
4. resolve `anchor(building.params)`;
5. add `normal * handleOffset` so outer controls sit outside the footprint and inner controls sit in the notch or courtyard void;
6. attach `controlId`, `axis`, and `sign` metadata to anchors and hit targets.

Delete `resizeFromPointer` from this module. Update `gizmoCursor` so `axis === 'x'` maps to `ew-resize` and `axis === 'z'` maps to `ns-resize`.

- [x] **Step 4: Update overlay orientation**

Replace `length`/`depth` checks with `x`/`z`:

```js
axisPoint.set(
  anchor.userData.axis === 'x' ? 1 : 0,
  0,
  anchor.userData.axis === 'z' ? 1 : 0
);
```

Keep the current DOM icons, fixed screen size, building occlusion, and hidden-target semantics unchanged.

- [x] **Step 5: Run gizmo tests and verify GREEN**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js tests/unit/building-gizmo-overlay.test.js
```

Expected: PASS with 4/6/8 resize controls and all existing rotation and occlusion tests green.

### Task 5: Delegate Drag Math And Provide Transient Geometry Preview

**Files:**
- Modify: `src/domain/buildings/editorCoordinates.js`
- Modify: `src/scene/gizmos/createBuildingGestures.js`
- Modify: `src/scene/syncScene.js`
- Modify: `src/scene/createSceneController.js`
- Modify: `tests/unit/scene-sync.test.js`
- Create: `tests/unit/building-dimension-drag.test.js`

- [x] **Step 1: Write failing coordinate and drag tests**

Add `worldPointToBuildingLocal(building, point)` tests for 0, 90, and 270 degree rotations. Add control-drag tests that pass the local point into `applyDimensionControl` and assert only the intended geometry parameter changes.

- [x] **Step 2: Write failing transient-preview lifecycle tests**

Extend the scene synchronizer test with fake rebuilt objects:

```js
sync.update([building]);
sync.showTransient({ ...building, params: resizedParams });
expect(canonical.visible).toBe(false);
expect(attachedPreview.userData.preview).toBe(true);
sync.clearTransient();
expect(canonical.visible).toBe(true);
expect(detach).toHaveBeenCalledWith(attachedPreview);
```

Call `showTransient` twice and assert the first transient object's dispose hook runs before replacement.

- [x] **Step 3: Run Task 5 tests and verify RED**

Run:

```powershell
npx vitest run tests/unit/building-dimension-drag.test.js tests/unit/scene-sync.test.js
```

Expected: FAIL because local coordinate conversion and transient preview methods do not exist.

- [x] **Step 4: Implement coordinate conversion and delegated drag math**

Implement the inverse building transform:

```js
export function worldPointToBuildingLocal(building, point) {
  const radians = building.rotation * Math.PI / 180;
  const dx = point.x - building.position.x;
  const dz = point.z - building.position.z;
  return {
    x: dx * Math.cos(radians) - dz * Math.sin(radians),
    z: dx * Math.sin(radians) + dz * Math.cos(radians)
  };
}
```

In `createBuildingGestures`, snapshot `startParams` at pointer down. For resize moves, convert the ground point to local coordinates and call `applyDimensionControl`. Set the label from the changed control role and normalized values rather than always displaying outer `length x depth`.

- [x] **Step 5: Implement transient preview in the synchronizer**

Add `showTransient(building)` and `clearTransient()` to `createSceneSynchronizer`:

- hide the canonical object for the same building id;
- rebuild one preview object with `{ preview: true, highlighted: false }`;
- attach the preview outside the canonical entry map;
- dispose and detach the previous transient before replacement;
- restore the canonical object's visibility when clearing;
- clear transient state before a normal `update` rebuild or synchronizer disposal.

Wire gesture callbacks in `createSceneController`:

```js
previewBuilding: building => synchronizer.showTransient(building),
clearBuildingPreview: () => synchronizer.clearTransient()
```

On pointer move, preview `{ ...building, params }`. On pointer up or cancel, clear the transient before committing the single undoable command. Do not execute store commands during pointer movement.

- [x] **Step 6: Run Task 5 and focused interaction tests**

Run:

```powershell
npx vitest run tests/unit/building-dimension-drag.test.js tests/unit/scene-sync.test.js tests/unit/building-gizmo.test.js tests/unit/building-gizmo-overlay.test.js
```

Expected: PASS. Inner-handle drags preview changed geometry without adding intermediate history entries.

### Task 6: Browser Workflow And Full Regression Verification

**Files:**
- Modify: `tests/e2e/sandbox-editor.spec.js`
- Modify: `docs/superpowers/specs/2026-07-15-building-type-control-model-design.md`
- Modify: `docs/superpowers/plans/2026-07-15-building-type-control-model.md`

- [x] **Step 1: Add an E2E template/control-count workflow**

In the desktop project, select the building and switch the type combobox through all templates. Assert the total DOM resize-icon count after each change:

```js
await expect(page.locator('[data-gizmo-icon="resize"]')).toHaveCount(4);
await typeSelect.selectOption('lShape');
await expect(page.locator('[data-gizmo-icon="resize"]')).toHaveCount(6);
await typeSelect.selectOption('courtyard');
await expect(page.locator('[data-gizmo-icon="resize"]')).toHaveCount(8);
```

Assert the inspector still exposes only floors and floor height as number inputs. Perform one short outer drag and one inner drag and assert undo becomes enabled after each committed gesture.

- [x] **Step 2: Run the focused E2E test**

Run:

```powershell
npx playwright test tests/e2e/sandbox-editor.spec.js --project=desktop
```

Expected: PASS with visible template changes, 4/6/8 total controls, and undoable outer and inner drags.

- [x] **Step 3: Perform browser visual verification**

At `http://127.0.0.1:4174/` verify:

- courtyard selection immediately shows a real centered opening;
- L inner controls sit in the missing corner and do not resemble detached outer controls;
- courtyard inner controls sit inside the opening;
- drag previews update the actual shape continuously;
- occluded inner and outer controls are both hidden and non-draggable;
- rotation ring, rotation direction arrow, compass, and camera locking remain unchanged;
- 1280x720 desktop and 1024x768 tablet layouts contain no control/panel overlap.

- [x] **Step 4: Run complete verification**

Run each command separately:

```powershell
npm test
npm run build
npm run test:e2e
git diff --check
```

Expected: all unit tests pass, production build exits 0, E2E has no failures, and diff check exits 0. Existing Vite chunk-size and BVH deprecation warnings remain non-blocking.

- [x] **Step 5: Close the design and plan records**

Set the design status to `Implemented and verified`, check every completed plan step, and record the observed final unit/E2E counts in this plan. Do not stage or commit these files in the current worktree.

## Verification Results

Observed on 2026-07-15:

- Task 5 focused interaction suite: 36 tests passed across 4 files.
- Building-gizmo overlay regression: 9 tests passed, including stable DOM control ids and sub-threshold preview cleanup on release/cancel.
- Code-review follow-up suite: 63 tests passed across 4 files, covering L boundary anchors and rejected-template history semantics.
- Focused desktop building workflow: 3 E2E tests passed, including exact outer and courtyard-inner drags.
- Tablet compass-overlap regression: 1 E2E test passed at 1024x768.
- Full unit suite: 59 files passed, 299 tests passed, 0 failed.
- Production build: passed; the existing chunk-size warning remains non-blocking.
- Full E2E suite: 32 passed, 12 conditionally skipped, 0 failed.
- Browser verification: courtyard opening, L-shaped notch controls, occlusion, and 1280x720 / 1024x768 layouts verified. The tablet inspector now hides the otherwise-overlapping compass while open.
- `git diff --check`: passed; existing Windows CRLF conversion warnings remain non-blocking.
- No files were staged or committed.
