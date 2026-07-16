# Building Gizmo Affordance Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambiguous building transform controls with four layered curved-arrow rotation markers and four flat capsule resize handles.

**Architecture:** Keep all visible and hit-test geometry inside `createBuildingGizmo` so gesture handling and transform math remain unchanged. Add small geometry factories for the layered rotation marker and rounded capsule, attach the existing gizmo metadata to their parent groups and hit targets, and preserve the current ring and resize hit-area contracts.

**Tech Stack:** JavaScript, Three.js geometry/material APIs, Vitest, Playwright, Vite

---

## File Map

- Modify `src/scene/gizmos/buildingGizmo.js`: add flat icon geometry factories, four rotation marker groups, and capsule resize visuals.
- Modify `tests/unit/building-gizmo.test.js`: replace cube-specific assertions and add structural/interaction contracts for rotation markers and capsules.
- Verify `src/scene/gizmos/createBuildingGestures.js`: no code change expected; all new controls reuse existing `rotate` and `resize` gizmo metadata.
- Reference `docs/superpowers/specs/2026-07-15-building-gizmo-affordance-polish-design.md`: accepted visual and interaction contract.

Commit steps are intentionally omitted because this workspace contains the user's larger uncommitted room-first redesign and the current task must not stage or commit those changes.

### Task 1: Add Failing Rotation Marker Contracts

**Files:**
- Modify: `tests/unit/building-gizmo.test.js`
- Test: `tests/unit/building-gizmo.test.js`

- [x] **Step 1: Replace the single idle rotation grip assertion with four marker contracts**

Add this test next to the existing external-grip test:

```js
it('places four layered rotation markers on the draggable ring', () => {
  const gizmo = createBuildingGizmo({
    id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 60, depth: 18 }
  });
  const nodes = [];
  gizmo.traverse(node => nodes.push(node));
  const markers = nodes.filter(node => node.userData.kind === 'building-rotation-marker');
  const markerHits = nodes.filter(node => node.userData.kind === 'building-rotation-marker-hit-target');

  expect(markers).toHaveLength(4);
  expect(markerHits).toHaveLength(4);
  expect(markers.every(marker => marker.userData.gizmo?.type === 'rotate')).toBe(true);
  expect(markerHits.every(hit => hit.userData.gizmo?.type === 'rotate')).toBe(true);
  for (const marker of markers) {
    const kinds = marker.children.map(child => child.userData.kind);
    expect(kinds).toEqual(expect.arrayContaining([
      'building-rotation-marker-underlay',
      'building-rotation-marker-arc',
      'building-rotation-marker-accent',
      'building-rotation-marker-tail',
      'building-rotation-marker-arrowhead'
    ]));
  }
  const resizeGrips = nodes.filter(node => node.userData.kind === 'building-resize-grip');
  const nearestGap = Math.min(...markers.flatMap(marker => resizeGrips.map(grip => (
    Math.hypot(marker.position.x - grip.parent.position.x, marker.position.z - grip.parent.position.z)
      - marker.userData.visualSize
      - grip.userData.visualWidth / 2
  ))));
  expect(nearestGap).toBeGreaterThanOrEqual(0.35);

  gizmo.userData.dispose();
});
```

Update older tests so they no longer require the removed single `building-rotation-grip` or `building-rotation-arrow` nodes.

- [x] **Step 2: Run the targeted test and verify RED**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js
```

Expected: FAIL because no `building-rotation-marker` or marker hit-target nodes exist.

### Task 2: Add Failing Capsule Resize Contracts

**Files:**
- Modify: `tests/unit/building-gizmo.test.js`
- Test: `tests/unit/building-gizmo.test.js`

- [x] **Step 1: Add the capsule structure test**

```js
it('uses four flat capsule resize handles with paired grip bars', () => {
  const gizmo = createBuildingGizmo({
    id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 60, depth: 18 }
  });
  const nodes = [];
  gizmo.traverse(node => nodes.push(node));
  const capsules = nodes.filter(node => node.userData.kind === 'building-resize-grip');
  const bars = nodes.filter(node => node.userData.kind === 'building-resize-grip-bar');
  const hitTargets = nodes.filter(node => node.userData.kind === 'building-resize-hit-target');

  expect(capsules).toHaveLength(4);
  expect(bars).toHaveLength(8);
  expect(capsules.every(handle => handle.userData.visualStyle === 'capsule')).toBe(true);
  expect(capsules.every(handle => handle.geometry.type === 'ShapeGeometry')).toBe(true);
  expect(hitTargets).toHaveLength(4);
  expect(Math.min(...hitTargets.map(node => node.geometry.parameters.width)))
    .toBeGreaterThan(Math.max(...capsules.map(node => node.userData.visualWidth)));

  gizmo.userData.dispose();
});
```

Update the existing gold-ring test to assert the capsule material color and `visualWidth` metadata instead of `BoxGeometry.parameters.width`.

- [x] **Step 2: Run the targeted test and verify RED**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js
```

Expected: FAIL because the current resize visuals are box geometry and have no capsule metadata or grip bars.

### Task 3: Implement Layered Rotation Markers

**Files:**
- Modify: `src/scene/gizmos/buildingGizmo.js`
- Test: `tests/unit/building-gizmo.test.js`

- [x] **Step 1: Add marker materials and a flat geometry helper**

Use UI token-equivalent colors and flat, depth-independent marker materials:

```js
const darkNeutral = 0x17212b;
const markerUnderlayMaterial = new THREE.MeshBasicMaterial({ color: darkNeutral, depthTest: false });
const markerAccentMaterial = new THREE.MeshBasicMaterial({ color: 0xffedbd, depthTest: false });
const markerGoldMaterial = new THREE.MeshBasicMaterial({ color: accentGold, depthTest: false });

function flatMesh(geometry, material, y, kind) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = 24;
  mesh.userData.kind = kind;
  return mesh;
}
```

- [x] **Step 2: Add a marker factory**

Before constructing the ring, calculate its radius from the footprint diagonal plus a clearance derived from the capsule width and marker size:

```js
const footprintRadius = Math.hypot(halfLength, halfDepth);
const referenceRadius = footprintRadius + 1.7;
const gripSize = THREE.MathUtils.clamp(referenceRadius * 0.125, 2.7, 4.2);
const markerSize = THREE.MathUtils.clamp(referenceRadius * 0.105, 2.5, 3.8);
const radius = footprintRadius + Math.max(3.2, gripSize * 0.95 + markerSize * 0.8);
```

Create `addRotationMarker(group, building, angle, radius, markerSize)` that:

- creates a `THREE.Group` at `(radius * cos(angle), 0, radius * sin(angle))`;
- assigns `building-rotation-marker` and the shared `{ type: 'rotate', buildingId }` gizmo metadata;
- adds an underlay and main arc from `RingGeometry`;
- adds a shorter pale-gold inner accent arc;
- adds a `CircleGeometry` tail dot and triangular `ShapeGeometry` arrowhead;
- rotates the marker around Y by `-angle` so its icon follows the ring;
- adds a transparent `BoxGeometry` hit target with `building-rotation-marker-hit-target` and the same gizmo metadata.

Use four calls:

```js
for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
  addRotationMarker(group, building, angle, radius, markerSize);
}
```

Remove the old single sphere rotation grip and tangent cone arrow.

- [x] **Step 3: Run the targeted test and verify marker GREEN**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js
```

Expected: marker test passes; capsule test still fails until Task 4.

### Task 4: Implement Flat Capsule Resize Handles

**Files:**
- Modify: `src/scene/gizmos/buildingGizmo.js`
- Test: `tests/unit/building-gizmo.test.js`

- [x] **Step 1: Add a rounded capsule shape factory**

```js
function capsuleShape(width, height) {
  const radius = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2 + radius, -height / 2);
  shape.lineTo(width / 2 - radius, -height / 2);
  shape.absarc(width / 2 - radius, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-width / 2 + radius, height / 2);
  shape.absarc(-width / 2 + radius, 0, radius, Math.PI / 2, Math.PI * 1.5, false);
  return shape;
}
```

- [x] **Step 2: Replace the visible box in `addResizeHandle`**

Create a parent group at the existing handle position. Add:

- one pale-gold `ShapeGeometry(capsuleShape(width, height))` mesh rotated flat onto the ground;
- one gold `EdgesGeometry` outline;
- two dark-neutral thin box or plane bars centered inside the capsule;
- `visualStyle: 'capsule'`, `visualWidth`, axis, and sign metadata on the visible capsule mesh;
- a Y rotation of `Math.PI / 2` for length-axis handles so every capsule runs parallel to its controlled building edge.

Keep the existing transparent resize hit target and its gizmo metadata. Size it from the capsule width plus the current forgiving margin.

- [x] **Step 3: Run the targeted test and verify GREEN**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js
```

Expected: all building-gizmo tests pass.

### Task 5: Verify Interaction And Visual Quality

**Files:**
- Verify: `src/scene/gizmos/createBuildingGestures.js`
- Verify: `src/scene/gizmos/buildingGizmo.js`
- Verify: `tests/unit/building-gizmo.test.js`

- [x] **Step 1: Inspect the focused diff and run whitespace checks**

Run:

```powershell
git diff --check
Select-String -Path src/scene/gizmos/buildingGizmo.js,tests/unit/building-gizmo.test.js -Pattern '[ \t]+$'
```

Expected: no whitespace errors.

- [x] **Step 2: Verify desktop and tablet in the in-app browser**

At `http://127.0.0.1:4174/`, verify:

- four curved-arrow markers are visible at the standard building directions;
- each marker reads as a layered rotation icon rather than a knob;
- all four capsule resize handles appear flat and keep two visible bars;
- dragging a marker rotates relative to pointer-down without snapping;
- dragging the ring away from a marker still rotates;
- resize capsules remain draggable;
- building occlusion still hides rear ring segments.
- rotation markers retain visible space from the resize capsules.

Repeat at a 1024 x 768 viewport and confirm no UI overlap or illegible control scaling.

- [x] **Step 3: Run complete verification**

Run:

```powershell
npm test
npm run build
npm run test:e2e
git diff --check
```

Expected: 55 unit test files pass with the added tests; the build exits 0; E2E reports 30 passed and 10 conditionally skipped; diff check exits 0. Existing Vite chunk-size and BVH deprecation warnings are non-blocking.
