# Building Type Control Model Design

**Date:** 2026-07-15

**Status:** Implemented and verified

## Problem

Building-type knowledge is currently split across several modules:

- `templates.js` owns labels and field names;
- `buildingCommands.js` owns one set of template defaults;
- `projectCommands.js` owns the room-first create and update path but always seeds bar defaults;
- `createFootprint.js` owns template-specific geometry branches;
- `buildingGizmo.js` assumes every building is a rectangle with only `length` and `depth` controls;
- project validation does not validate `wingLength`, `wingDepth`, `courtyardLength`, or `courtyardDepth`.

This split has already produced two user-visible failures. Switching a bar building to courtyard keeps only bar parameters, so the courtyard hole is built from invalid coordinates. L-shaped and courtyard buildings also receive the same four rectangular resize controls as a bar building, contrary to the room-first specification's segmented-dimension requirement.

## Goal

Create one domain-level building-type module that owns each template's geometry parameters, footprint construction, parameter constraints, and editable dimension controls.

Adding a future T-, U-, or other rectilinear template should require a new type definition and its tests, without adding template branches to commands, validation, or the Three.js gizmo renderer.

## Non-Goals

- Do not introduce a generic arbitrary-polygon constraint solver.
- Do not make buildings user-authored parametric graphs.
- Do not change move or rotation behavior.
- Do not expose numeric dimension inputs again in the inspector.
- Do not couple domain definitions to Three.js, DOM, pointer events, or camera projection.
- Do not require class inheritance; plain frozen objects and pure functions are preferred.

## Architecture

Introduce a `BuildingTypeDefinition` interface at a domain seam. Three adapters, `bar`, `lShape`, and `courtyard`, satisfy the interface. A registry resolves a template id to its definition.

The module is deliberately deeper than the current template metadata. Callers use a small interface while the implementation hides:

- template geometry defaults;
- the complete set of geometry parameter names;
- footprint construction;
- cross-parameter constraints;
- dimension-control placement;
- pointer-to-parameter conversion.

The interface is functional even if a future implementation chooses classes internally.

```js
const definition = getBuildingTypeDefinition(building.template);

const nextParams = createBuildingParams({
  currentParams,
  templateId: building.template,
  overrides
});
definition.createFootprint(nextParams);
definition.getDimensionControls(nextParams);
definition.validateParams(nextParams);
applyDimensionControl({ templateId, controlId, startParams, pointerLocal });
```

Unknown type ids are rejected at the registry seam. Callers do not fall back silently to `bar`.

## Type Definition

Each adapter has the following conceptual shape:

```js
defineBuildingType({
  id: 'courtyard',
  label: '回字形',
  geometryFields: [
    'length',
    'depth',
    'courtyardLength',
    'courtyardDepth'
  ],
  defaults: {
    length: 60,
    depth: 40,
    courtyardLength: 30,
    courtyardDepth: 16
  },
  normalizeParams(params) {},
  createFootprint(params) {},
  validateParams(params) {},
  getDimensionControls(params) {}
});
```

`createParams` is registry-provided behavior shared by all adapters. When changing type it:

1. removes every geometry field owned by any registered type;
2. preserves non-geometry parameters such as floors and floor heights;
3. applies the new type's defaults;
4. applies explicit overrides;
5. normalizes the result with the new adapter.

This makes type switching atomic and prevents parameters from the previous template leaking into the new template.

## Dimension Control Definition

A dimension control describes domain behavior rather than rendered geometry:

```js
{
  id: 'courtyard-east',
  role: 'inner-length',
  axis: 'x',
  sign: 1,

  anchor(params) {
    return { x: params.courtyardLength / 2, z: 0 };
  },

  applyDrag({ startParams, pointerLocal }) {
    return {
      courtyardLength: clamp(
        Math.abs(pointerLocal.x) * 2,
        MIN_COURTYARD_SPAN,
        startParams.length - MIN_WALL_THICKNESS * 2
      )
    };
  }
}
```

The control interface includes:

- a stable semantic id;
- an `x` or `z` local axis for icon orientation and cursor selection;
- an anchor derived from current normalized parameters;
- an `applyDrag` function that receives drag-start parameters and the current building-local ground point;
- optional dimension-label metadata for future dimension lines.

Using drag-start parameters avoids cumulative drift. The control returns a parameter patch and never mutates the building.

Reusable internal control factories generate symmetric outer and inner control pairs. These factories remain implementation details rather than becoming another public seam.

## Template Controls

### Bar

Four outer controls:

- east and west change `length`;
- north and south change `depth`.

The building-local origin remains fixed, preserving the current symmetric resize behavior.

### L Shape

Six controls:

- four outer controls change overall `length` and `depth`;
- one control on the inner vertical segment changes `wingLength`;
- one control on the inner horizontal segment changes `wingDepth`.

Dragging an inner control leaves the outer dimensions unchanged. Dragging an outer control normalizes dependent wing dimensions so the missing corner never collapses or inverts.

### Courtyard

Eight controls:

- four outer controls change overall `length` and `depth`;
- four inner controls change `courtyardLength` and `courtyardDepth`.

Opposing inner controls modify the same centered courtyard dimension. The courtyard stays centered because the current data model has no courtyard offset parameters.

## Parameter Constraints

The adapters own shape-specific invariants:

- all outer spans remain at least the existing building minimum;
- L-shape wing dimensions remain positive and leave a positive missing-corner span on both axes;
- courtyard dimensions remain positive;
- courtyard dimensions remain smaller than their matching outer dimensions by at least twice the minimum wall thickness;
- all normalized geometry values are finite.

Commands normalize after type switches and dimension drags. Project validation uses the same adapter invariants but reports errors rather than silently repairing imported data.

## Data Flow

### Type Switch

```text
Inspector selection
  -> createUpdateBuildingCommand(template)
  -> createBuildingParams(currentParams, nextType)
  -> normalized complete building params
  -> store revision update
  -> scene rebuild through definition.createFootprint
```

### Dimension Drag

```text
definition.getDimensionControls(params)
  -> generic gizmo renders anchors and hit targets
  -> pointer projected to building-local ground point
  -> selected control.applyDrag(startParams, pointerLocal)
  -> definition.normalizeParams(mergedParams)
  -> createUpdateBuildingCommand(params)
  -> store revision update and scene rebuild
```

## Module Ownership

- `src/domain/buildings/buildingTypes.js`: registry and shared public interface.
- `src/domain/buildings/types/bar.js`: bar adapter.
- `src/domain/buildings/types/lShape.js`: L-shape adapter.
- `src/domain/buildings/types/courtyard.js`: courtyard adapter.
- `src/domain/buildings/createFootprint.js`: compatibility facade delegating to the registry, or removed after callers migrate.
- `src/store/projectCommands.js`: canonical room-first building create/update commands using registry parameter creation.
- Legacy `buildingCommands.js` adapters were removed when the room-first migration completed; runtime building writes go through `projectCommands.js`, while v1 file compatibility remains isolated in `migrateProject.js`.
- `src/domain/project/validateProject.js`: delegate template-specific geometry checks to the selected adapter.
- `src/scene/gizmos/buildingGizmo.js`: generic rendering of returned control definitions.
- `src/scene/gizmos/createBuildingGestures.js`: delegate resize calculation to the active control definition.

The domain module must not import scene or store modules.

## Error Handling

- Unknown template ids cause an explicit domain error in internal creation paths and a validation error on project import.
- Missing or non-finite template parameters fail validation.
- Schema-v2 drafts created by the existing type-switch bug are repaired during migration only when a required geometry field is absent; explicit invalid values are not replaced.
- Invalid imported cross-parameter combinations fail validation with template-specific messages.
- Interactive drags are clamped and normalized before reaching the store, so normal pointer motion cannot create invalid geometry.
- Switching templates always creates a complete parameter set before the store publishes the next state.

## Testing

### Domain Tests

- each registered adapter creates finite default parameters and a valid footprint;
- switching from every template to every other template removes stale geometry fields and seeds complete defaults;
- normalization enforces each template's cross-parameter constraints;
- control anchors lie on the expected outer or inner footprint segment;
- each control changes only its intended parameter set;
- extreme pointer positions cannot invert an L shape or collapse courtyard walls.

### Store And Inspector Tests

- changing the inspector selection from bar to courtyard produces finite courtyard parameters;
- every store command path delegates building parameter creation and normalization to one canonical domain module;
- type switching preserves vertical and non-geometry parameters.

### Gizmo Tests

- bar creates four dimension anchors;
- L shape creates six dimension anchors;
- courtyard creates eight dimension anchors;
- generic rendering preserves current icon projection, occlusion, and forgiving hit targets;
- dragging every control produces an undoable store update.

### Browser Verification

- switching among all three templates visibly rebuilds the correct footprint;
- L-shape inner controls adjust both leg thicknesses independently;
- courtyard inner controls resize the centered courtyard while keeping valid walls;
- front controls remain draggable and building-occluded controls remain hidden and disabled;
- rotation and movement behavior remain unchanged.

## Acceptance Criteria

1. Selecting courtyard from the inspector produces a visible courtyard opening immediately.
2. No supported template can enter the scene with missing or non-finite geometry parameters.
3. Bar, L-shape, and courtyard buildings expose 4, 6, and 8 dimension controls respectively.
4. The generic gizmo renderer contains no branches for specific template ids.
5. Building commands contain no hard-coded bar-only defaults.
6. Template-specific validation and drag constraints come from the selected definition.
7. Adding another rectilinear template requires a new adapter and registration, not edits across commands, validation, and scene rendering.
8. Existing move, rotation, overlay occlusion, room, opening, and sunlight behavior remains green.
