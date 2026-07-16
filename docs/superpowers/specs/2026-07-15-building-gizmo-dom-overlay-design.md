# Building Gizmo DOM Icon Overlay Design

**Date:** 2026-07-15

**Status:** Implemented and verified

## Problem

The current transform icons are assembled from small world-space Three.js meshes. At oblique camera angles, the resize capsule compresses into an oval with two dots and resembles a snout. The layered rotation marker loses separation between its underlay, primary arc, accent arc, tail dot, and arrowhead, producing a dirty or fragmented silhouette.

The controls are editor UI, not physical scene objects. Their visual representation should therefore live in a screen-space UI layer while their hit testing remains in the Three.js scene.

## Goal

Replace the visible world-space marker geometry with clean, standard SVG icons that keep a stable screen size and orientation across camera angles, building sizes, and desktop/tablet layouts.

## Architecture

Split visual presentation from interaction:

- Three.js keeps the gold rotation ring, invisible rotation-marker hit targets, invisible resize hit targets, and non-rendered anchor objects.
- A DOM overlay inside the canvas parent renders the visible icons.
- The scene animation loop asks the building gesture controller to update the overlay after camera controls update.
- The overlay projects each anchor's world position into canvas-local screen coordinates.
- DOM icons use `pointer-events: none`; pointer gestures continue to raycast only against Three.js hit targets.

## Icon Source And Styling

- Use standard Lucide SVG icons through the framework-neutral `lucide` package.
- Use `rotate-cw` for the four rotation markers.
- Use `move-horizontal` for all four resize markers, rotated in screen space to match the projected building-local resize axis.
- Render icons at a stable 26px desktop/tablet size.
- Draw one clean gold glyph using the existing `#e7a52d` accent.
- Add only an exact white outline of the same SVG path for contrast; do not add shadows, badges, capsules, dots, secondary arcs, or decorative layers.
- Use round SVG caps and joins so the standard icon remains crisp at small sizes.

## Anchors And Hit Targets

- Keep four rotation anchors at the building-local front, back, left, and right positions on the ring.
- Keep four resize anchors outside the midpoint of the controlled building sides.
- Each anchor stores its overlay kind and, for resize anchors, the building-local drag axis.
- Each anchor has a corresponding invisible Three.js hit target with the existing rotate or resize gizmo metadata.
- Keep the full rotation ring draggable outside the four marker targets.
- Keep the current relative-rotation formula and resize math unchanged.
- Preserve the enlarged forgiving hit areas independently of the 26px DOM icon dimensions.

## Projection And Orientation

For every animation frame while a building gizmo is active:

1. Read each anchor's world position.
2. Project it through the active Three.js camera.
3. Convert normalized device coordinates into canvas-local CSS pixels.
4. Position the corresponding DOM element with `translate(-50%, -50%)`.
5. For resize anchors, project a second world point one unit along the stored building-local axis and calculate the screen-space angle with `atan2`.
6. Rotate the `move-horizontal` icon to that angle so its arrows match the actual drag direction.

Rotation icons keep their standard upright SVG orientation. Their location on the circular ring already communicates the rotation relationship; rotating the glyph itself would reduce recognizability.

## Visibility And Occlusion

Hide any DOM icon when one of these conditions is true:

- the anchor is behind the camera;
- the projected point is outside the canvas;
- no building gizmo is active;
- room drawing or another mutually exclusive edit mode is active.

Additionally hide any rotation or resize icon when the selected building or another building intersects the camera-to-anchor ray before the anchor. This matches the existing rotation-ring occlusion contract and keeps every visible control consistent with scene depth.

When building geometry blocks an icon, block its corresponding transparent Three.js hit target as well. A control must be draggable only when it is visible; users must not be able to resize or rotate through an occluding building.

Use a dedicated raycaster for the maximum eight overlay anchors.

## Lifecycle

- Create one overlay root when `createBuildingGestures` initializes.
- Rebuild its icon elements when the selected building gizmo changes.
- Update positions from the existing scene animation loop.
- Clear icons when selection is removed or room editing begins.
- Remove the overlay root when the gesture controller is disposed.
- The active center-to-pointer rotation guide and compass-style label remain unchanged.

## Files

- `src/scene/gizmos/buildingGizmo.js`: remove visible marker/capsule meshes; create anchors and preserve transparent hit targets.
- `src/scene/gizmos/buildingGizmoOverlay.js`: own SVG DOM elements, projection, resize-axis orientation, occlusion, and lifecycle.
- `src/scene/gizmos/createBuildingGestures.js`: create and synchronize the overlay.
- `src/scene/createSceneController.js`: update the overlay once per animation frame.
- `src/styles/layout.css`: add the pointer-transparent overlay and icon styling.
- `tests/unit/building-gizmo.test.js`: verify anchor and hit-target contracts instead of visible geometry composition.
- `tests/unit/building-gizmo-overlay.test.js`: verify DOM construction, projection, orientation, hiding, and disposal.
- `package.json` and lockfile: add the framework-neutral `lucide` dependency.

## Testing

- Unit tests verify four rotation anchors, four resize anchors, and eight matching hit targets.
- Unit tests verify the overlay creates four `rotate-cw` and four `move-horizontal` SVG icons.
- Unit tests verify projected positioning and resize-axis rotation with a real Three.js camera.
- Unit tests verify behind-camera and out-of-bounds anchors are hidden.
- Unit tests verify building-occluded rotation and resize icons are hidden.
- Unit tests verify building geometry in front of any rotate or resize target blocks that target from resolving.
- Unit tests verify overlay cleanup on selection change and disposal.
- Existing relative-rotation, ring occlusion, cursor, history, and resize math tests remain green.
- Browser verification covers the user's oblique top-down view, the default desktop view, and 1024 x 768 tablet view.
- Browser interaction verifies rotation-marker, ring, and resize-target drags still create undoable edits.

## Acceptance Criteria

1. No visible resize control resembles a capsule, oval, or pair of dots.
2. Rotation controls use a single clean standard rotate icon without fragmented dark geometry.
3. Icons remain crisp and approximately 26px across supported camera angles.
4. Resize arrows align with the projected drag direction.
5. Rotation and resize icons follow building occlusion consistently.
6. The full ring and every unoccluded dedicated target remain draggable; occluded targets do not resolve.
7. Relative rotation does not snap.
8. Desktop and tablet layouts contain no icon/UI overlap.
9. Unit tests, build, and E2E tests pass.
