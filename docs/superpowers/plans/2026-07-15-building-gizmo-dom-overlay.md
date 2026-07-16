# Building Gizmo DOM Icon Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace distorted world-space transform icons with stable 26px Lucide SVG icons in a camera-projected DOM overlay while preserving Three.js hit testing and transform behavior.

**Architecture:** `buildingGizmo.js` owns only the ring, non-rendered anchors, transparent hit targets, and unified hit-target occlusion. A new `buildingGizmoOverlay.js` maps anchors to DOM icons, projects them every animation frame, rotates resize arrows into the projected drag direction, and applies ring-equivalent occlusion to every icon. `createBuildingGestures` owns the overlay lifecycle and `createSceneController` drives its per-frame update.

**Tech Stack:** JavaScript, Three.js, Lucide, DOM/CSS, Vitest with jsdom, Playwright, Vite

---

## File Map

- Modify `package.json` and `package-lock.json`: add `lucide@1.24.0`.
- Modify `src/scene/gizmos/buildingGizmo.js`: replace visible marker/capsule geometry with anchors and transparent hit targets.
- Create `src/scene/gizmos/buildingGizmoOverlay.js`: render Lucide icon data into SVG and synchronize projected DOM positions.
- Modify `src/scene/gizmos/createBuildingGestures.js`: create, set, clear, update, and dispose the overlay.
- Modify `src/scene/createSceneController.js`: call the overlay update from the animation loop after camera controls update.
- Modify `src/styles/layout.css`: add overlay and clean outlined icon styles.
- Modify `tests/unit/building-gizmo.test.js`: test anchor/hit contracts and absence of old visible geometry.
- Create `tests/unit/building-gizmo-overlay.test.js`: test DOM creation, projection, direction, hiding, and disposal.

Commit steps are omitted because the workspace contains the user's larger uncommitted redesign and this task must not stage or commit unrelated work.

### Task 1: Add Lucide Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Install the pinned framework-neutral package**

Run:

```powershell
npm install lucide@1.24.0
```

Expected: `lucide` appears in dependencies and the lockfile records version `1.24.0`.

- [x] **Step 2: Verify the icon-data API**

Run:

```powershell
node -e "import('lucide').then(({icons}) => console.log(Boolean(icons.RotateCw), Boolean(icons.MoveHorizontal)))"
```

Expected: `true true`.

### Task 2: Replace Visible Geometry With Anchors

**Files:**
- Modify: `tests/unit/building-gizmo.test.js`
- Modify: `src/scene/gizmos/buildingGizmo.js`

- [x] **Step 1: Write failing anchor contracts**

Replace visible-layer assertions with:

```js
it('creates eight overlay anchors with matching transparent hit targets', () => {
  const gizmo = createBuildingGizmo({
    id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 60, depth: 18 }
  });
  const nodes = [];
  gizmo.traverse(node => nodes.push(node));
  const rotationAnchors = nodes.filter(node => node.userData.kind === 'building-rotation-overlay-anchor');
  const resizeAnchors = nodes.filter(node => node.userData.kind === 'building-resize-overlay-anchor');

  expect(rotationAnchors).toHaveLength(4);
  expect(resizeAnchors).toHaveLength(4);
  expect(resizeAnchors.filter(node => node.userData.axis === 'length')).toHaveLength(2);
  expect(resizeAnchors.filter(node => node.userData.axis === 'depth')).toHaveLength(2);
  expect(nodes.filter(node => node.userData.kind === 'building-rotation-marker-hit-target')).toHaveLength(4);
  expect(nodes.filter(node => node.userData.kind === 'building-resize-hit-target')).toHaveLength(4);
  expect(nodes.some(node => node.userData.kind === 'building-rotation-marker-arc')).toBe(false);
  expect(nodes.some(node => node.userData.kind === 'building-resize-grip')).toBe(false);

  gizmo.userData.dispose();
});
```

Keep existing spacing, ring depth-test, relative rotation, resize math, cursor, and occlusion tests.

- [x] **Step 2: Run RED**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js
```

Expected: FAIL because the current gizmo still contains visible marker and capsule meshes and no overlay anchors.

- [x] **Step 3: Implement anchors and preserve hit targets**

In `buildingGizmo.js`:

- remove `flatMesh`, `capsuleShape`, `arrowheadShape`, visible marker materials, and visible resize materials;
- replace each rotation marker group with a plain `THREE.Object3D`:

```js
const anchor = new THREE.Object3D();
anchor.position.set(radius * Math.cos(angle), 0.42, radius * Math.sin(angle));
anchor.userData.kind = 'building-rotation-overlay-anchor';
anchor.userData.overlayIcon = 'rotate';
group.add(anchor);
```

- retain one transparent marker hit box at the same position with rotate gizmo metadata;
- add each resize anchor directly to the gizmo at the current side-midpoint position:

```js
anchor.userData.kind = 'building-resize-overlay-anchor';
anchor.userData.overlayIcon = 'resize';
anchor.userData.axis = handle.axis;
anchor.userData.sign = handle.sign;
```

- keep the transparent resize hit box and gizmo metadata;
- preserve the enlarged ring clearance so rotation and resize targets do not overlap.

- [x] **Step 4: Run GREEN**

Run the targeted test again. Expected: all `building-gizmo` tests pass.

### Task 3: Build The DOM Overlay

**Files:**
- Create: `tests/unit/building-gizmo-overlay.test.js`
- Create: `src/scene/gizmos/buildingGizmoOverlay.js`

- [x] **Step 1: Write failing DOM and projection tests**

Use `// @vitest-environment jsdom` and test:

```js
const overlay = createBuildingGizmoOverlay({ container, canvas, camera, buildingsGroup });
overlay.setGizmo(gizmo);
expect(container.querySelectorAll('[data-gizmo-icon="rotate"]')).toHaveLength(4);
expect(container.querySelectorAll('[data-gizmo-icon="resize"]')).toHaveLength(4);
expect(container.querySelectorAll('svg[data-lucide="rotate-cw"]')).toHaveLength(8);
expect(container.querySelectorAll('svg[data-lucide="move-horizontal"]')).toHaveLength(8);
```

Two SVGs per icon are expected: one exact white outline and one gold glyph.

With a real `THREE.PerspectiveCamera`, call `overlay.update()` and assert:

```js
expect(icon.style.left).toMatch(/px$/);
expect(icon.style.top).toMatch(/px$/);
expect(icon.style.getPropertyValue('--gizmo-icon-angle')).toMatch(/deg$/);
expect(icon.hidden).toBe(false);
```

Move an anchor behind the camera and outside normalized device coordinates, then expect its icon to be hidden. Add a building mesh between camera and either a rotation or resize anchor and expect occlusion to hide it.

- [x] **Step 2: Run RED**

Run:

```powershell
npx vitest run tests/unit/building-gizmo-overlay.test.js
```

Expected: FAIL because `buildingGizmoOverlay.js` does not exist.

- [x] **Step 3: Implement Lucide SVG rendering**

Create `buildingGizmoOverlay.js` with:

```js
import * as THREE from 'three';
import { icons } from 'lucide';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createLucideSvg(iconNode, iconName, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('data-lucide', iconName);
  svg.classList.add(className);
  for (const [tag, attributes] of iconNode) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) child.setAttribute(name, value);
    svg.append(child);
  }
  return svg;
}
```

Create each wrapper with `data-gizmo-icon`, `aria-hidden="true"`, an outline SVG, and a glyph SVG using `icons.RotateCw` or `icons.MoveHorizontal`.

- [x] **Step 4: Implement projection, orientation, and occlusion**

`createBuildingGizmoOverlay({ container, canvas, camera, buildingsGroup })` returns `setGizmo`, `update`, `clear`, and `dispose`.

In `update`:

```js
anchor.getWorldPosition(worldPoint);
camera.getWorldDirection(cameraForward);
toAnchor.copy(worldPoint).sub(camera.position);
if (toAnchor.dot(cameraForward) <= 0) hide();
ndc.copy(worldPoint).project(camera);
if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z < -1 || ndc.z > 1) hide();
```

Convert NDC to container-local pixels using both canvas and container rectangles. For resize anchors, project `anchor.localToWorld(axisPoint)` and set `--gizmo-icon-angle` to `atan2(screenDy, screenDx)` degrees.

For icon occlusion, raycast from `camera.position` toward every anchor against `buildingsGroup.children`; hide when the nearest hit distance is less than the anchor distance minus `0.05`.

- [x] **Step 5: Run GREEN**

Run the overlay test and then both gizmo test files. Expected: all pass.

### Task 4: Integrate Overlay Lifecycle And Styling

**Files:**
- Modify: `src/scene/gizmos/createBuildingGestures.js`
- Modify: `src/scene/createSceneController.js`
- Modify: `src/styles/layout.css`

- [x] **Step 1: Integrate lifecycle**

In `createBuildingGestures`:

```js
const overlay = createBuildingGizmoOverlay({
  container: canvas.parentElement,
  canvas,
  camera,
  buildingsGroup
});
```

Call `overlay.setGizmo(gizmo)` after creating a selected-building gizmo, `overlay.clear()` when there is none, expose `updateOverlay: () => overlay.update()`, and call `overlay.dispose()` during controller disposal.

In the scene animation loop, after `cameraParts.controls.update()` call:

```js
buildingGestures.updateOverlay();
```

- [x] **Step 2: Add clean CSS**

```css
.building-gizmo-overlay { position: absolute; inset: 0; z-index: 4; overflow: hidden; pointer-events: none; }
.building-gizmo-icon { --gizmo-icon-angle: 0deg; position: absolute; width: 26px; height: 26px; transform: translate(-50%, -50%) rotate(var(--gizmo-icon-angle)); }
.building-gizmo-icon svg { position: absolute; inset: 0; width: 100%; height: 100%; stroke-linecap: round; stroke-linejoin: round; }
.building-gizmo-icon__outline { stroke: rgb(255 255 255 / 96%); stroke-width: 5; }
.building-gizmo-icon__glyph { stroke: #e7a52d; stroke-width: 2.4; }
```

No shadow, background badge, capsule, dot, or secondary decoration is allowed.

- [x] **Step 3: Run focused unit tests and build**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js tests/unit/building-gizmo-overlay.test.js
npm run build
```

Expected: focused tests and build pass.

### Task 5: Visual And Interaction Verification

**Files:**
- Verify: `src/scene/gizmos/buildingGizmoOverlay.js`
- Verify: `src/styles/layout.css`

- [x] **Step 1: Verify required views**

At `http://127.0.0.1:4174/`, inspect:

- the user's oblique top-down camera angle;
- default 1280 x 720 desktop;
- 1024 x 768 tablet.

Confirm resize controls read as four standard double arrows, rotation controls are clean standard rotate icons, icon size remains stable, and every building-occluded icon is hidden.

- [x] **Step 2: Verify interaction targets**

Use short drags from a rotation icon, an empty ring segment, and a resize icon. Each must enable undo; rotation must remain relative and must not move the camera.

- [x] **Step 3: Run full verification**

```powershell
npm test
npm run build
npm run test:e2e
git diff --check
```

Expected: all unit files pass with the added overlay tests, build exits 0, E2E reports 30 passed and 10 conditional skips, and diff check exits 0. Existing Vite chunk-size and BVH deprecation warnings are non-blocking.

### Task 6: Unify Building Occlusion For Resize Controls

**Files:**
- Modify: `tests/unit/building-gizmo-overlay.test.js`
- Modify: `tests/unit/building-gizmo.test.js`
- Modify: `src/scene/gizmos/buildingGizmoOverlay.js`
- Modify: `src/scene/gizmos/buildingGizmo.js`

- [x] **Step 1: Write failing overlay and hit-resolution tests**

Change the resize-overlay expectation so a building between the camera and resize anchor hides the DOM icon. Change the resize hit-resolution expectation so a building intersection before the resize hit target returns `null`.

- [x] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run tests/unit/building-gizmo-overlay.test.js tests/unit/building-gizmo.test.js
```

Expected: the resize overlay remains visible and `resolveGizmo` still returns the resize handle, proving both old exceptions are covered.

- [x] **Step 3: Remove the resize occlusion exceptions**

In `buildingGizmoOverlay.js`, apply `isOccluded(distance)` to every overlay item. In `buildingGizmo.js`, return `null` whenever `blockedByEntity` is true before any gizmo handle, regardless of handle type.

- [x] **Step 4: Run focused tests and verify GREEN**

```powershell
npx vitest run tests/unit/building-gizmo-overlay.test.js tests/unit/building-gizmo.test.js
```

Expected: both focused test files pass.

- [x] **Step 5: Run full automated and browser verification**

```powershell
npm test
npm run build
npm run test:e2e
git diff --check
```

Expected: the automated suite and build pass. In the browser, rear resize icons disappear behind building geometry, front controls remain visible and draggable, and dragging an occluded location does not mutate the building.
