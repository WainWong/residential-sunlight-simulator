# Room-First Interaction Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace observation-area-first editing with a schema-v2 room, derived-wall, explicit-opening, and direct-sunlight workflow across desktop, tablet, and mobile.

**Architecture:** Keep the existing vanilla-JS command store and Three.js controller, but move geometry rules into pure `domain/rooms`, `domain/walls`, and `domain/openings` modules. Persist rooms and opening anchors, derive walls from building footprints plus room unions, and adapt the simulation boundary to portals so UI and ray analysis share one model.

**Tech Stack:** Vite, vanilla JavaScript, Three.js, Vitest, Playwright.

---

### Task 1: Schema v2 and migration

**Files:**
- Modify: `src/domain/project/defaultProject.js`
- Modify: `src/domain/project/migrateProject.js`
- Modify: `src/domain/project/validateProject.js`
- Modify: `src/features/project/localDraft.js`
- Test: `tests/unit/migrate-project.test.js`
- Test: `tests/unit/project-schema.test.js`

- [ ] **Step 1: Write failing v1-to-v2 and v2 validation tests**

```js
expect(migrateProject(v1).schemaVersion).toBe(2);
expect(migrateProject(v1).buildings[0].rooms[0]).toMatchObject({ id: 'a1', type: null, objects: [] });
expect(migrateProject(v1).simulation.activeRoomId).toBe('a1');
expect(validateProject(migrateProject(v1)).ok).toBe(true);
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run tests/unit/migrate-project.test.js tests/unit/project-schema.test.js`
Expected: FAIL because schema 2 and `rooms` are not implemented.

- [ ] **Step 3: Implement atomic schema-v2 defaults, migration, and validation**

Migration converts every v1 area to a named room, converts legacy openings to anchored explicit openings, renames active/interior/editing state, and returns a cloned v2 project without mutating input. V2 input is normalized idempotently.

- [ ] **Step 4: Re-run focused tests**

Run: `npx vitest run tests/unit/migrate-project.test.js tests/unit/project-schema.test.js`
Expected: PASS.

### Task 2: Room, wall, and opening domain model

**Files:**
- Create: `src/domain/rooms/roomGeometry.js`
- Create: `src/domain/walls/deriveWalls.js`
- Create: `src/domain/walls/wallDirection.js`
- Create: `src/domain/openings/openingGeometry.js`
- Test: `tests/unit/room-geometry.test.js`
- Test: `tests/unit/derived-walls.test.js`
- Test: `tests/unit/opening-geometry.test.js`

- [ ] **Step 1: Write failing geometry tests**

```js
expect(validateRoomRects([...connected])).toEqual({ ok: true, reason: null });
expect(validateRoomRects([...disconnected]).reason).toBe('disconnected');
expect(deriveWalls(building, 1)).toContainEqual(expect.objectContaining({ roomIds: ['r1', 'r2'], kind: 'shared' }));
expect(formatWallDirection([-.707, -.707])).toBe('西南 225°');
expect(reprojectOpening(opening, shorterWall).status).toBe('invalid');
```

- [ ] **Step 2: Run tests and confirm missing-module failures**

Run: `npx vitest run tests/unit/room-geometry.test.js tests/unit/derived-walls.test.js tests/unit/opening-geometry.test.js`
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement normalized rect unions, adjacency-derived walls, direction formatting, presets, clamping, overlap checks, and reprojection**

The wall ID is a stable quantized geometry key, openings store `wallAnchor`, `bounds`, `connectedRoomIds`, `fill`, and `status`, and no derived wall is persisted.

- [ ] **Step 4: Re-run focused domain tests**

Run: `npx vitest run tests/unit/room-geometry.test.js tests/unit/derived-walls.test.js tests/unit/opening-geometry.test.js`
Expected: PASS.

### Task 3: Commands, history, and room sessions

**Files:**
- Create: `src/store/roomCommands.js`
- Modify: `src/store/buildingCommands.js`
- Modify: `src/store/createStore.js`
- Test: `tests/unit/room-commands.test.js`
- Test: `tests/unit/store.test.js`

- [ ] **Step 1: Write failing room workflow and history tests**

```js
store.execute(createStartRoomCommand('b1', 2));
store.execute(createAppendRoomRectCommand(validRect));
store.execute(createFinishRoomCommand());
expect(store.getState().buildings[0].rooms).toHaveLength(1);
expect(store.getState().view.selection.kind).toBe('room');
expect(store.canUndo()).toBe(true);
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run tests/unit/room-commands.test.js tests/unit/store.test.js`
Expected: FAIL because room commands and history capability state do not exist.

- [ ] **Step 3: Implement commands for selection, room draft/finalization, room metadata, openings, phase/interior navigation, and undo/redo capability**

Each pointer gesture dispatches one final command; preview state uses `store.setView` and never enters history.

- [ ] **Step 4: Re-run focused store tests**

Run: `npx vitest run tests/unit/room-commands.test.js tests/unit/store.test.js`
Expected: PASS.

### Task 4: Room-first shell and contextual panels

**Files:**
- Create: `src/features/rooms/RoomEditor.js`
- Create: `src/features/openings/OpeningEditor.js`
- Modify: `src/features/buildings/BuildingInspector.js`
- Modify: `src/features/shell/DesktopShell.js`
- Modify: `src/features/shell/AppShell.js`
- Modify: `src/features/shell/MobileShell.js`
- Modify: `src/features/results/ResultsPanel.js`
- Modify: `src/styles/layout.css`
- Modify: `src/styles/editors.css`
- Modify: `src/styles/controls.css`
- Test: `tests/unit/app-shell.test.js`
- Test: `tests/unit/project-tree.test.js`
- Test: `tests/unit/room-editor.test.js`

- [ ] **Step 1: Write failing component tests for product language and contextual actions**

```js
expect(shell.textContent).toContain('搭建场景');
expect(shell.textContent).toContain('查看采光');
expect(shell.textContent).not.toMatch(/观察区|画区|擦除|进入观察区/);
expect(tree.querySelector('[data-testid="room-tree-r1"]')).not.toBeNull();
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run tests/unit/app-shell.test.js tests/unit/project-tree.test.js tests/unit/room-editor.test.js`
Expected: FAIL on old terminology and missing room controls.

- [ ] **Step 3: Implement object tree, contextual inspector, one-click sunlight entry, undo/redo buttons, breadcrumbs, desktop/tablet drawers, and mobile read-only shell**

The building form exposes width rather than depth and hides position coordinates. Room creation starts directly with drawing; finishing reveals opening guidance and the sunlight CTA.

- [ ] **Step 4: Re-run focused component tests**

Run: `npx vitest run tests/unit/app-shell.test.js tests/unit/project-tree.test.js tests/unit/room-editor.test.js`
Expected: PASS.

### Task 5: Scene picking, room drawing, building manipulation, and opening visuals

**Files:**
- Create: `src/scene/gizmos/buildingGizmo.js`
- Create: `src/scene/gizmos/openingGizmo.js`
- Create: `src/scene/wallOverlay.js`
- Modify: `src/scene/createSceneController.js`
- Modify: `src/scene/picking.js`
- Modify: `src/scene/observationOverlay.js`
- Modify: `src/scene/buildingMesh.js`
- Modify: `src/main.js`
- Test: `tests/unit/picking.test.js`
- Test: `tests/unit/scene-preview.test.js`
- Test: `tests/e2e/room-first-flow.spec.js`

- [ ] **Step 1: Add failing picking and end-to-end expectations**

```js
expect(resolvePickedEntity([{ object: wallMesh }])).toEqual({ kind: 'wall', id: wallMesh.userData.wallId });
await page.getByTestId('add-room-b1').click();
await expect(page.getByTestId('room-session-title')).toContainText('新建房间');
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run tests/unit/picking.test.js tests/unit/scene-preview.test.js`
Expected: FAIL because only building IDs are picked.

- [ ] **Step 3: Implement typed scene selection, direct room drawing, wall hover/selection, explicit opening meshes, and gesture-level building transforms**

Pointer-down captures a snapshot, pointer-move updates lightweight preview meshes, and pointer-up commits one command. Tablet hit targets are expanded without inflating visual handles.

- [ ] **Step 4: Re-run scene unit tests**

Run: `npx vitest run tests/unit/picking.test.js tests/unit/scene-preview.test.js`
Expected: PASS.

### Task 6: Multi-room simulation and navigation

**Files:**
- Modify: `src/domain/simulation/buildOpeningPortals.js`
- Modify: `src/domain/simulation/buildObstacles.js`
- Modify: `src/features/results/createSimulationController.js`
- Modify: `src/workers/dailyAnalysis.worker.js`
- Modify: `src/main.js`
- Test: `tests/unit/multi-room-direct-sun.test.js`
- Test: `tests/unit/simulation-controller.test.js`
- Test: `tests/e2e/room-first-flow.spec.js`

- [ ] **Step 1: Write failing outside-window-to-doorway-to-target-room path test**

```js
expect(evaluateRoomDirectSun({ project, activeRoomId: 'target', sunDirection }).hasDirectSun).toBe(true);
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run tests/unit/multi-room-direct-sun.test.js tests/unit/simulation-controller.test.js`
Expected: FAIL because active room and explicit multi-portal traversal are missing.

- [ ] **Step 3: Adapt simulation to room samples, explicit glass/open portals, continuous portal paths, room switching, interior entry, exterior return, and latest-wins daily analysis**

Result copy reports only direct sunlight, lit-area ratio, daily intervals/duration, sun angles, and blocking buildings.

- [ ] **Step 4: Re-run focused simulation tests**

Run: `npx vitest run tests/unit/multi-room-direct-sun.test.js tests/unit/simulation-controller.test.js`
Expected: PASS.

### Task 7: Full regression and visual verification

**Files:**
- Modify: existing tests and fixtures only where schema-v2 expectations replace v1 product behavior.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: all tests pass with no unhandled errors.

- [ ] **Step 2: Build production bundle**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Run Playwright desktop/mobile suite**

Run: `npm run test:e2e`
Expected: all desktop and mobile projects pass.

- [ ] **Step 4: Inspect desktop, tablet, and mobile screenshots in the browser**

Verify no overlaps, a nonblank Three.js scene, usable direct-manipulation handles, tablet drawers, and mobile read-only behavior.
