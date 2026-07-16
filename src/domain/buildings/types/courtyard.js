import {
  clamp,
  createOuterControls,
  MIN_VOID_SPAN,
  MIN_WALL_THICKNESS,
  normalizeBoundedSpan,
  normalizeSpan,
  rectangle,
  validateSpan
} from './shared.js';

const MIN_OUTER_SPAN = MIN_VOID_SPAN + MIN_WALL_THICKNESS * 2;

function innerControl(id, parameter, axis, sign, normal) {
  return Object.freeze({
    id,
    role: parameter === 'courtyardLength' ? 'inner-length' : 'inner-depth',
    axis,
    sign,
    normal: Object.freeze(normal),
    anchor(params) {
      return axis === 'x'
        ? { x: sign * params.courtyardLength / 2, z: 0 }
        : { x: 0, z: sign * params.courtyardDepth / 2 };
    },
    applyDrag({ startParams, pointerLocal }) {
      const outer = axis === 'x' ? startParams.length : startParams.depth;
      return {
        [parameter]: clamp(
          Math.abs(pointerLocal[axis]) * 2,
          MIN_VOID_SPAN,
          outer - MIN_WALL_THICKNESS * 2
        )
      };
    }
  });
}

const controls = Object.freeze([
  ...createOuterControls(),
  innerControl('courtyard-east', 'courtyardLength', 'x', 1, { x: -1, z: 0 }),
  innerControl('courtyard-west', 'courtyardLength', 'x', -1, { x: 1, z: 0 }),
  innerControl('courtyard-north', 'courtyardDepth', 'z', 1, { x: 0, z: -1 }),
  innerControl('courtyard-south', 'courtyardDepth', 'z', -1, { x: 0, z: 1 })
]);

export const courtyardType = Object.freeze({
  id: 'courtyard',
  label: '回字形',
  geometryFields: Object.freeze([
    'length', 'depth', 'courtyardLength', 'courtyardDepth'
  ]),
  defaults: Object.freeze({
    length: 60,
    depth: 40,
    courtyardLength: 30,
    courtyardDepth: 16
  }),
  normalizeParams(params) {
    const length = normalizeSpan(params.length, MIN_OUTER_SPAN);
    const depth = normalizeSpan(params.depth, MIN_OUTER_SPAN);
    return {
      ...params,
      length,
      depth,
      courtyardLength: normalizeBoundedSpan(
        params.courtyardLength,
        MIN_VOID_SPAN,
        length - MIN_WALL_THICKNESS * 2
      ),
      courtyardDepth: normalizeBoundedSpan(
        params.courtyardDepth,
        MIN_VOID_SPAN,
        depth - MIN_WALL_THICKNESS * 2
      )
    };
  },
  validateParams(params) {
    const issues = [];
    validateSpan(params, 'length', MIN_OUTER_SPAN, issues);
    validateSpan(params, 'depth', MIN_OUTER_SPAN, issues);
    validateSpan(params, 'courtyardLength', MIN_VOID_SPAN, issues);
    validateSpan(params, 'courtyardDepth', MIN_VOID_SPAN, issues);
    if (Number.isFinite(params.length) && Number.isFinite(params.courtyardLength)
      && params.courtyardLength > params.length - MIN_WALL_THICKNESS * 2) {
      issues.push('courtyardLength must leave two walls');
    }
    if (Number.isFinite(params.depth) && Number.isFinite(params.courtyardDepth)
      && params.courtyardDepth > params.depth - MIN_WALL_THICKNESS * 2) {
      issues.push('courtyardDepth must leave two walls');
    }
    return issues;
  },
  createFootprint(params) {
    const halfLength = params.courtyardLength / 2;
    const halfDepth = params.courtyardDepth / 2;
    return {
      outer: rectangle(params.length, params.depth),
      holes: [[
        [-halfLength, -halfDepth],
        [-halfLength, halfDepth],
        [halfLength, halfDepth],
        [halfLength, -halfDepth]
      ]]
    };
  },
  getDimensionControls() {
    return controls;
  }
});
