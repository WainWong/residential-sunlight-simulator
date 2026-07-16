# Building Gizmo Visual Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make building transform controls depth-correct, visually stronger, compass-readable during rotation, and remove redundant dimension/rotation inputs from the inspector.

**Architecture:** Keep static building transform affordances in `buildingGizmo.js`, and isolate the transient radial arrow in a new `buildingRotationGuide.js` module. `createBuildingGestures.js` owns the guide lifecycle and label placement, while `BuildingInspector.js` removes only the three scene-gizmo-controlled inputs. Existing transform math and command history boundaries remain unchanged.

**Tech Stack:** JavaScript ES modules, Three.js 0.185, Vitest 4, Playwright 1.61, Vite 8.

**Repository constraint:** This plan depends on the current uncommitted room-first redesign. Work in the current branch, preserve unrelated changes, and do not commit unless the user explicitly requests it.

---

## File Map

- Create `src/scene/gizmos/buildingRotationGuide.js`: transient radial arrow geometry and compass-style direction formatting.
- Modify `src/scene/gizmos/buildingGizmo.js`: gold ring, thicker geometry, stronger resize grips, depth-correct ring material, and occlusion-aware hit resolution.
- Modify `src/scene/gizmos/createBuildingGestures.js`: active guide lifecycle and outward direction-label positioning.
- Modify `src/features/buildings/BuildingInspector.js`: remove length, width, and rotation inputs only.
- Create `tests/unit/building-rotation-guide.test.js`: direction label and guide geometry tests.
- Modify `tests/unit/building-gizmo.test.js`: ring/handle styling and occlusion resolution tests.
- Modify `tests/unit/building-inspector.test.js`: removed-input contract.

### Task 1: Compass-Style Active Rotation Guide

**Files:**
- Create: `src/scene/gizmos/buildingRotationGuide.js`
- Create: `tests/unit/building-rotation-guide.test.js`
- Reference: `src/domain/walls/wallDirection.js`

- [ ] **Step 1: Write the failing direction and geometry tests**

```js
import { describe, expect, it } from 'vitest';
import {
  createBuildingRotationGuide,
  rotationDirectionLabel,
  updateBuildingRotationGuide
} from '../../src/scene/gizmos/buildingRotationGuide.js';

describe('building rotation guide', () => {
  it('formats the radial arrow as a compass bearing', () => {
    const center = { x: 0, z: 0 };
    expect(rotationDirectionLabel(center, { x: 0, z: 1 })).toBe('正北 0°');
    expect(rotationDirectionLabel(center, { x: 1, z: 1 })).toBe('东北 45°');
    expect(rotationDirectionLabel(center, { x: 1, z: 0 })).toBe('正东 90°');
    expect(rotationDirectionLabel(center, { x: -1, z: -1 })).toBe('西南 225°');
  });

  it('extends a visible radial arrow beyond the pointer', () => {
    const guide = createBuildingRotationGuide();
    updateBuildingRotationGuide(guide, { x: 2, z: 3 }, { x: 2, z: 13 });
    const arrow = guide.getObjectByName('building-rotation-guide-arrow');
    const shaft = guide.getObjectByName('building-rotation-guide-shaft');

    expect(guide.visible).toBe(true);
    expect(shaft.scale.y).toBeGreaterThan(10);
    expect(arrow.position.z).toBeGreaterThan(13);
    expect(arrow.material.depthTest).toBe(false);

    guide.userData.dispose();
  });
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```powershell
npx vitest run tests/unit/building-rotation-guide.test.js
```

Expected: FAIL because `buildingRotationGuide.js` does not exist.

- [ ] **Step 3: Implement the isolated guide module**

Create a hidden world-space group with a unit-height cylinder shaft and cone arrowhead. Reuse `formatWallDirection` so labels match existing eight-direction language.

```js
import * as THREE from 'three';
import { formatWallDirection } from '../../domain/walls/wallDirection.js';

const GOLD = 0xe7a52d;
const UP = new THREE.Vector3(0, 1, 0);

export function rotationDirectionLabel(center, point) {
  return formatWallDirection([point.x - center.x, point.z - center.z]);
}

export function createBuildingRotationGuide() {
  const material = new THREE.MeshBasicMaterial({
    color: GOLD, depthTest: false, depthWrite: false
  });
  const group = new THREE.Group();
  group.name = 'building-rotation-guide';
  group.visible = false;

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1, 12), material);
  shaft.name = 'building-rotation-guide-shaft';
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.15, 16), material);
  arrow.name = 'building-rotation-guide-arrow';
  group.add(shaft, arrow);
  group.userData.dispose = () => group.traverse(child => child.geometry?.dispose());
  return group;
}

export function updateBuildingRotationGuide(group, center, point) {
  const start = new THREE.Vector3(center.x, 0.72, center.z);
  const direction = new THREE.Vector3(point.x - center.x, 0, point.z - center.z);
  const pointerDistance = direction.length();
  if (pointerDistance < 1e-6) {
    group.visible = false;
    return;
  }
  direction.normalize();
  const length = pointerDistance + 1.4;
  const end = start.clone().addScaledVector(direction, length);
  const shaft = group.getObjectByName('building-rotation-guide-shaft');
  const arrow = group.getObjectByName('building-rotation-guide-arrow');
  shaft.position.copy(start).add(end).multiplyScalar(0.5);
  shaft.scale.set(1, length, 1);
  shaft.quaternion.setFromUnitVectors(UP, direction);
  arrow.position.copy(end);
  arrow.quaternion.setFromUnitVectors(UP, direction);
  group.visible = true;
}
```

- [ ] **Step 4: Run the guide tests and confirm GREEN**

Run:

```powershell
npx vitest run tests/unit/building-rotation-guide.test.js
```

Expected: 2 tests pass.

### Task 2: Gold, Depth-Correct Ring And Stronger Resize Grips

**Files:**
- Modify: `src/scene/gizmos/buildingGizmo.js`
- Modify: `tests/unit/building-gizmo.test.js`

- [ ] **Step 1: Add failing visual-contract and occlusion tests**

Extend imports with `resolveGizmo`, then add:

```js
it('uses the UI gold ring with depth occlusion and stronger grips', () => {
  const gizmo = createBuildingGizmo({
    id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
    params: { length: 60, depth: 18 }
  });
  const nodes = [];
  gizmo.traverse(node => nodes.push(node));
  const ring = nodes.find(node => node.userData.kind === 'building-rotation-ring');
  const grips = nodes.filter(node => node.userData.kind === 'building-resize-grip');

  expect(ring.material.color.getHex()).toBe(0xe7a52d);
  expect(ring.geometry.parameters.tube).toBeCloseTo(0.28);
  expect(ring.material.depthTest).toBe(true);
  expect(Math.min(...grips.map(grip => grip.geometry.parameters.width)))
    .toBeGreaterThanOrEqual(2.9);
  expect(grips[0].material.color.getHex()).toBe(0xffedbd);

  gizmo.userData.dispose();
});

it('does not resolve a hidden ring through a nearer building', () => {
  const building = { userData: { entityId: 'b1' }, parent: null };
  const ring = {
    userData: { gizmo: { type: 'rotate', buildingId: 'b1' } }, parent: null
  };
  expect(resolveGizmo([{ object: building }, { object: ring }])).toBeNull();
  expect(resolveGizmo([{ object: ring }, { object: building }]))
    .toMatchObject({ type: 'rotate', buildingId: 'b1' });
});
```

- [ ] **Step 2: Run the gizmo tests and confirm RED**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js
```

Expected: FAIL on the old orange color, `0.16` tube, disabled depth test, old grip size/color, and hidden-ring resolution.

- [ ] **Step 3: Apply the visual constants and blocking rule**

In `buildingGizmo.js`:

```js
const accentGold = 0xe7a52d;
const ringMaterial = new THREE.MeshBasicMaterial({
  color: accentGold, transparent: true, opacity: 0.96,
  depthTest: true, depthWrite: false
});
const gripMaterial = new THREE.MeshBasicMaterial({ color: 0xffedbd, depthTest: false });
const outlineMaterial = new THREE.LineBasicMaterial({ color: accentGold, depthTest: false });
```

Change the scale and ring tube:

```js
const gripSize = THREE.MathUtils.clamp(radius * 0.092, 1.6, 3.0);
const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.28, 12, 96), ringMaterial);
```

Stop resolution at a nearer building entity while still allowing non-pickable visible grip geometry to fall through to its larger hit target:

```js
export function resolveGizmo(intersections) {
  for (const intersection of intersections) {
    let object = intersection.object;
    while (object) {
      if (object.userData?.gizmo) return object.userData.gizmo;
      if (object.userData?.entityId) return null;
      object = object.parent;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the gizmo tests and confirm GREEN**

Run:

```powershell
npx vitest run tests/unit/building-gizmo.test.js
```

Expected: all building gizmo tests pass.

### Task 3: Wire The Rotation Guide Into Pointer Gestures

**Files:**
- Modify: `src/scene/gizmos/createBuildingGestures.js`
- Test: `tests/unit/building-rotation-guide.test.js`

- [ ] **Step 1: Add a failing label-position helper test**

Export a pure helper from `createBuildingGestures.js` and test it in `building-rotation-guide.test.js`:

```js
import { outwardLabelOffset } from '../../src/scene/gizmos/createBuildingGestures.js';

it('places the direction label outward from the drag point', () => {
  expect(outwardLabelOffset({ x: 100, y: 100 }, { x: 130, y: 140 }, 24))
    .toEqual({ x: 144.4, y: 159.2 });
});
```

- [ ] **Step 2: Run the targeted test and confirm RED**

Run:

```powershell
npx vitest run tests/unit/building-rotation-guide.test.js
```

Expected: FAIL because `outwardLabelOffset` is not exported.

- [ ] **Step 3: Implement the pure label offset and guide lifecycle**

Add the helper:

```js
export function outwardLabelOffset(center, pointer, distance = 24) {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: Number((pointer.x + dx / length * distance).toFixed(1)),
    y: Number((pointer.y + dy / length * distance).toFixed(1))
  };
}
```

Import the guide functions, create one guide per controller, and add it to the scene:

```js
import {
  createBuildingRotationGuide,
  rotationDirectionLabel,
  updateBuildingRotationGuide
} from './buildingRotationGuide.js';

const rotationGuide = createBuildingRotationGuide();
scene.add(rotationGuide);
```

In the rotation branch, preserve `rotationFromPointer` for the stored value and add visual feedback:

```js
const rotation = rotationFromPointer(building.position, point);
gesture.value = { rotation };
if (object) object.rotation.y = THREE.MathUtils.degToRad(rotation);
updateBuildingRotationGuide(rotationGuide, building.position, point);
label.textContent = rotationDirectionLabel(building.position, point);
```

When positioning the rotation label, project the building center to canvas pixels and offset the label from the pointer along the center-to-pointer screen vector:

```js
if (handle.type === 'rotate') {
  const projected = new THREE.Vector3(building.position.x, 0.72, building.position.z)
    .project(camera);
  const rect = canvas.getBoundingClientRect();
  const center = {
    x: (projected.x * 0.5 + 0.5) * rect.width,
    y: (-projected.y * 0.5 + 0.5) * rect.height
  };
  const position = outwardLabelOffset(center, {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  });
  label.style.left = `${position.x}px`;
  label.style.top = `${position.y}px`;
}
```

Set `rotationGuide.visible = false` in `finish()`, on selection/project changes when no rotation gesture is active, and before controller disposal. During disposal also remove the guide from the scene and invoke `rotationGuide.userData.dispose()`.

- [ ] **Step 4: Run both gesture-related unit files and confirm GREEN**

Run:

```powershell
npx vitest run tests/unit/building-rotation-guide.test.js tests/unit/building-gizmo.test.js
```

Expected: all tests pass.

### Task 4: Remove Dimension And Rotation Inputs

**Files:**
- Modify: `src/features/buildings/BuildingInspector.js`
- Modify: `tests/unit/building-inspector.test.js`

- [ ] **Step 1: Replace stale inspector expectations with the new contract**

Update the building panel test and remove the rotation-input revision test:

```js
it('keeps vertical controls and removes scene-gizmo transform inputs', () => {
  const { store, element } = mount();
  store.execute(createAddBuildingCommand({ id: 'b1' }));

  const numberInputs = [...element.querySelectorAll('input[type="number"]')];
  expect(numberInputs).toHaveLength(2);
  expect(numberInputs.map(input => input.getAttribute('aria-label')))
    .toEqual(['楼层数', '标准层高（米）']);
  expect(element.textContent).not.toMatch(/建筑长度|建筑宽度|旋转角度/);
  expect(element.querySelector('[data-testid="inspector-add-room-b1"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run the inspector tests and confirm RED**

Run:

```powershell
npx vitest run tests/unit/building-inspector.test.js
```

Expected: FAIL because five number inputs still render.

- [ ] **Step 3: Remove only the three transform fields**

Delete these calls from `buildingPanel()`:

```js
numberField('建筑长度（米）', building.params.length, length => update({ params: { length } })),
numberField('建筑宽度（米）', building.params.depth, depth => update({ params: { depth } })),
numberField('旋转角度（顺时针）', building.rotation, rotation => update({ rotation })),
```

Keep the floor-count and floor-height `numberField()` calls unchanged. Remove `createUpdateBuildingCommand` from the test import if no remaining test uses it.

- [ ] **Step 4: Run the inspector tests and confirm GREEN**

Run:

```powershell
npx vitest run tests/unit/building-inspector.test.js
```

Expected: all inspector tests pass with exactly two numeric inputs.

### Task 5: Full Verification And Visual QA

**Files:**
- Verify: `src/scene/gizmos/buildingGizmo.js`
- Verify: `src/scene/gizmos/buildingRotationGuide.js`
- Verify: `src/scene/gizmos/createBuildingGestures.js`
- Verify: `src/features/buildings/BuildingInspector.js`

- [ ] **Step 1: Run the complete unit suite**

```powershell
npm test
```

Expected: all Vitest files and tests pass with zero failures.

- [ ] **Step 2: Build the production bundle**

```powershell
npm run build
```

Expected: Vite exits `0`; the existing chunk-size warning may remain.

- [ ] **Step 3: Run the complete E2E suite**

```powershell
npm run test:e2e
```

Expected: 30 passed, 10 configured skips, zero failures; existing BVH deprecation warnings may remain.

- [ ] **Step 4: Verify desktop interaction at `1440 x 900`**

Use Playwright against `http://127.0.0.1:4174/` to add and select a default building, then confirm:

- the gold ring is thicker;
- facade geometry hides the rear ring segment;
- moving over the hidden segment does not produce `grab`;
- all four resize grips are larger and remain outside the facade;
- rotation drag shows a radial arrow and a label such as `西南 225°`;
- the label changes direction as the pointer crosses cardinal sectors;
- releasing the drag hides the guide and preserves the building rotation;
- the inspector renders only floor count and floor height numeric inputs;
- the WebGL center pixel is nonblank and the console has no errors.

- [ ] **Step 5: Verify the `1024 x 768` tablet layout**

Open the project-tree drawer, add a building, close the inspector drawer, and confirm the ring, grips, and active guide do not overlap the tablet controls or overflow the viewport.

- [ ] **Step 6: Check the final working tree**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no generated screenshots or temporary scripts in the repository. Preserve all pre-existing dirty room-first files. Do not stage or commit.
