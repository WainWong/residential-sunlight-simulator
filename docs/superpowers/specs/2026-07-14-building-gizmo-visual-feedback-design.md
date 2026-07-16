# Building Gizmo Visual Feedback Design

**Date:** 2026-07-14

**Status:** Approved design, pending implementation plan

## Goal

Make building resize and rotation controls visually clear, spatially coherent, and consistent with the simulator's existing UI palette while removing redundant numeric editing controls from the inspector.

## Scope

This change affects only building transform affordances and the building inspector. Existing transform math, project data precision, selection behavior, and one-history-command-per-gesture semantics remain unchanged.

## Rotation Ring

- Replace the current orange with the product accent gold used by `--sun-500` (`#e7a52d`).
- Increase the visible torus tube radius from approximately `0.16` to `0.28` world units.
- Enable depth testing on the visible ring so building geometry hides portions behind or underneath the building.
- Keep the invisible rotation hit target larger than the visible ring.
- Prevent an occluded hit target from being selected through building geometry. A nearer building intersection blocks farther gizmo intersections.
- Keep the idle circular rotation grip and its small tangent arrow so rotation remains discoverable before dragging.

## Resize Handles

- Increase visible handle size by approximately 15 percent, with clamped scaling retained for small and large buildings.
- Use a pale gold fill with a `--sun-500`-equivalent outline for stronger contrast against facades and ground.
- Keep all four handles outside the building footprint.
- Preserve the larger invisible hit targets and existing length/depth cursor mapping.

## Active Rotation Guide

- Show the guide only during a rotation drag.
- Draw a gold radial shaft from the building center toward the current ground pointer position, extending to an outward arrowhead.
- Render the active guide above scene geometry so its meaning remains clear while it crosses the building.
- Place the floating direction label beside the arrow tip, rather than displaying a bare degree number at the pointer.
- Format the label like the compass readout: `正北 0°`, `东北 45°`, `正东 90°`, `东南 135°`, `正南 180°`, `西南 225°`, `正西 270°`, or `西北 315°`, with intermediate bearings rounded to the nearest integer.
- The displayed bearing describes the radial arrow's world direction. The stored building rotation remains continuous and uses the existing rotation convention.
- Hide and dispose the guide on pointer up, pointer cancel, selection change, and controller disposal.

## Building Inspector

- Remove the building length, building width, and clockwise rotation input fields.
- Keep name, type, floor count, and standard floor height controls.
- Do not replace the removed inputs with read-only metrics or an advanced disclosure.
- Building dimensions and rotation remain editable through scene gizmos only.

## Interaction And History

- Hover cursors remain `move`, `ew-resize`, `ns-resize`, and `grab`.
- Active rotation remains `grabbing`.
- Preview transforms remain immediate during pointer movement.
- A completed gesture creates exactly one store command; cancelled or unmoved gestures create none.

## Testing

- Unit tests verify ring color, thickness, depth testing, and occlusion-aware gizmo resolution.
- Unit tests verify the larger resize grip geometry and unchanged larger hit targets.
- Unit tests verify cardinal direction labels for representative points and integer rounding for intermediate bearings.
- Unit tests verify the building inspector no longer renders length, width, or rotation inputs while retaining floor and floor-height controls.
- Browser verification covers desktop and 1024 x 768 tablet layouts, visible ring occlusion, handle contrast, active radial guide direction, cursor transitions, numeric field removal, nonblank WebGL output, and console errors.

## Acceptance Criteria

1. No visible ring segment draws over the building when it is geometrically behind the building.
2. Hidden ring segments cannot start a rotation gesture through the building.
3. Resize grips are visibly stronger than the current implementation without overlapping the building.
4. The ring uses UI gold and appears materially thicker.
5. Rotation dragging shows a center-to-pointer arrow and a compass-style bearing label.
6. The inspector contains no length, width, or rotation input.
7. Existing unit, build, and end-to-end suites continue to pass.
