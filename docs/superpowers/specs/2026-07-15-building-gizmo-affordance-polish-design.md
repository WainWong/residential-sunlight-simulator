# Building Gizmo Affordance Polish Design

**Date:** 2026-07-15

**Status:** Approved design, pending implementation plan

## Goal

Make building rotation and resize controls recognizable before interaction while keeping the scene visually quiet and consistent with the simulator's dark-neutral and sun-gold UI palette.

## Scope

This change affects only the visible building rotation markers and resize handles. Existing transform math, center-to-pointer active rotation guide, compass-style direction label, history behavior, hit occlusion, and inspector fields remain unchanged.

## Rotation Ring Affordance

- Keep the existing gold rotation ring, depth occlusion, and enlarged invisible ring hit target.
- Add four visible rotation markers at the building-local front, back, left, and right directions.
- Place every marker on the rotation ring, outside the building footprint and outside the nearby resize capsule.
- Increase the ring clearance only as much as needed to keep cardinal rotation markers and resize capsules from overlapping on small and default-size buildings.
- Keep the complete ring draggable; the four markers are additional draggable rotation targets, not the only interaction points.
- Give each marker the same rotation gizmo metadata as the ring so pointer behavior, cursors, gesture math, and history remain shared.

## Double-Track Rotation Marker

Each marker is a compact layered icon aligned to the ring curvature:

- A short gold curved arrow is the primary rotation symbol.
- A thinner and shorter pale-gold inner arc adds visual depth without becoming another control.
- A small circular tail dot identifies a natural drag starting point.
- A slightly larger dark-neutral underlay follows the primary arrow and improves contrast against both building surfaces and the ground.
- The marker stays visually flat and lightweight; it must not resemble a large circular button or a 3D knob.
- Arrowheads follow the same clockwise path around the ring. The icon communicates rotation, while dragging remains bidirectional.
- Marker geometry uses stable world-space dimensions with clamps so the icons remain legible on both small and default-size buildings.
- Every marker receives an invisible hit target larger than its visible geometry.

## Resize Handle

Replace each visible box grip with a flat short capsule icon:

- Use a pale-gold capsule surface with a sun-gold outline.
- Add two dark-neutral parallel bars centered inside the capsule.
- Orient the capsule and bars parallel to the building edge they control; dragging remains perpendicular to that edge.
- Keep all four handles outside the footprint at the midpoint of each standard building side.
- Keep the current invisible hit targets and length/depth cursor mapping.
- The visible handle must have negligible height and must not read as a cube from the standard perspective camera.
- Use clamped dimensions so the capsule remains readable without growing excessively on large buildings.

## Materials And Layering

- Reuse the existing `#e7a52d` sun-gold and pale-gold grip color.
- Use a dark neutral sampled from the shell palette for marker underlays and capsule bars.
- Visible resize handles and rotation markers render above the ground for clarity.
- The main rotation ring keeps depth testing so geometrically hidden segments remain hidden by the building.
- Invisible hit geometry remains fully transparent and is not part of the visual composition.

## Interaction

- Hovering the ring or any rotation marker uses `grab`; active dragging uses `grabbing`.
- Hovering resize capsules preserves the existing length/depth resize cursors.
- Dragging from any rotation marker uses the relative rotation formula based on the pointer-down angle; it must not snap to an absolute direction.
- The active guide continues to start at the building center and pass through the current pointer.
- A completed gesture creates one history command; an unmoved or cancelled gesture creates none.

## Testing

- Unit tests verify exactly four visible rotation markers and four marker hit targets.
- Unit tests verify every marker and marker hit target resolves to the rotation gizmo.
- Unit tests verify each marker contains a primary curved arrow, inner accent arc, tail dot, and dark underlay.
- Unit tests verify exactly four resize capsules, each with two centered grip bars and a larger invisible hit target.
- Existing relative-rotation, occlusion, cursor, and resize math tests remain unchanged.
- Browser verification covers the default 60 x 18 building at desktop and tablet viewports.
- Browser verification confirms that the four rotation markers are visible, their icon meaning remains clear against the facade and ground, the resize controls do not resemble cubes, and all targets remain draggable.
- Unit and browser verification confirm that rotation markers and resize capsules do not overlap.

## Acceptance Criteria

1. The idle ring communicates rotation through four curved-arrow markers at the building's standard directions.
2. Users can start rotation from any marker or any visible portion of the ring.
3. Rotation remains relative to the pointer-down angle and does not snap.
4. Each rotation marker has a visible double-track treatment, tail dot, and dark contrast layer.
5. The four resize handles read as flat capsule drag icons with two bars, not 3D cubes.
6. Existing hit areas remain at least as forgiving as before.
7. Ring occlusion and hidden-ring click blocking remain intact.
8. Unit tests, production build, and end-to-end tests pass.
9. Rotation markers and resize capsules retain a visible gap at all four standard directions.
