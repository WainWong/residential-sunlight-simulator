# Building Gizmo Affordance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make building resize and rotation controls visually discoverable and easier to hit without changing transform math or history behavior.

**Architecture:** Keep `buildingGizmo.js` responsible for the Three.js visual and pick geometry. Separate restrained visible meshes from larger transparent hit targets, add a dedicated rotation grip and tangent arrow, and expose a pure cursor resolver used by `createBuildingGestures.js` for hover and drag feedback.

**Tech Stack:** JavaScript, Three.js, Vitest, Playwright.

---

### Task 1: Visible controls and expanded hit targets

**Files:**
- Modify: `tests/unit/building-gizmo.test.js`
- Modify: `src/scene/gizmos/buildingGizmo.js`

- [ ] **Step 1: Write failing gizmo structure tests**

Assert that a building gizmo contains four external resize grips, four larger transparent resize hit targets, a rotation grip, and at least one tangent arrowhead. Assert that the visible grips sit beyond the corresponding building half-extent.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/building-gizmo.test.js`

Expected: FAIL because the current four white meshes are both the visuals and hit targets, sit on the facade, and the rotation ring has no grip or arrow.

- [ ] **Step 3: Implement the minimal Three.js geometry**

Use outlined white resize grips with orange accents outside each facade. Keep their visual geometry near one world unit while giving each grip an invisible hit mesh around 1.8 world units. Add an orange rotation grip on the ring and a triangular/conical tangent arrow; keep the complete ring draggable.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run tests/unit/building-gizmo.test.js`

Expected: all building gizmo tests pass.

### Task 2: Hover and drag feedback

**Files:**
- Modify: `tests/unit/building-gizmo.test.js`
- Modify: `src/scene/gizmos/buildingGizmo.js`
- Modify: `src/scene/gizmos/createBuildingGestures.js`

- [ ] **Step 1: Write failing cursor mapping tests**

Assert `move -> move`, `rotate -> grab`, `length resize -> ew-resize`, and `depth resize -> ns-resize`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run tests/unit/building-gizmo.test.js`

Expected: FAIL because no cursor resolver exists.

- [ ] **Step 3: Implement hover and active cursor feedback**

On pointer move without an active gesture, raycast the gizmo and selected building and update `canvas.style.cursor`. While dragging rotation use `grabbing`; while resizing preserve the axis cursor; while moving use `move`. Reset to the default cursor when the pointer leaves the controls or the controller disposes.

- [ ] **Step 4: Run focused tests, full tests, and visual verification**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js
npm test
npm run build
```

Then capture the selected-building scene at desktop and tablet viewports. Verify the canvas is nonblank, handles do not overlap the building, the rotation grip is obvious, and no page errors are emitted.
