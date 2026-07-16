import {
  clamp,
  createOuterControls,
  MIN_BUILDING_SPAN,
  MIN_VOID_SPAN,
  normalizeBoundedSpan,
  normalizeSpan,
  validateSpan
} from './shared.js';

const MIN_OUTER_SPAN = MIN_BUILDING_SPAN + MIN_VOID_SPAN;

const innerVertical = Object.freeze({
  id: 'l-inner-vertical',
  role: 'wing-length',
  axis: 'x',
  sign: 1,
  normal: Object.freeze({ x: 1, z: 0 }),
  anchor(params) {
    return {
      x: -params.length / 2 + params.wingLength,
      z: params.wingDepth / 2
    };
  },
  applyDrag({ startParams, pointerLocal }) {
    return {
      wingLength: clamp(
        pointerLocal.x + startParams.length / 2,
        MIN_BUILDING_SPAN,
        startParams.length - MIN_VOID_SPAN
      )
    };
  }
});

const innerHorizontal = Object.freeze({
  id: 'l-inner-horizontal',
  role: 'wing-depth',
  axis: 'z',
  sign: 1,
  normal: Object.freeze({ x: 0, z: 1 }),
  anchor(params) {
    return {
      x: params.wingLength / 2,
      z: -params.depth / 2 + params.wingDepth
    };
  },
  applyDrag({ startParams, pointerLocal }) {
    return {
      wingDepth: clamp(
        pointerLocal.z + startParams.depth / 2,
        MIN_BUILDING_SPAN,
        startParams.depth - MIN_VOID_SPAN
      )
    };
  }
});

const outerControls = createOuterControls({
  'outer-east': params => ({
    x: params.length / 2,
    z: -params.depth / 2 + params.wingDepth / 2
  }),
  'outer-north': params => ({
    x: -params.length / 2 + params.wingLength / 2,
    z: params.depth / 2
  })
});

const controls = Object.freeze([
  ...outerControls,
  innerVertical,
  innerHorizontal
]);

export const lShapeType = Object.freeze({
  id: 'lShape',
  label: 'L 型',
  geometryFields: Object.freeze(['length', 'depth', 'wingLength', 'wingDepth']),
  defaults: Object.freeze({ length: 60, depth: 40, wingLength: 18, wingDepth: 16 }),
  normalizeParams(params) {
    const length = normalizeSpan(params.length, MIN_OUTER_SPAN);
    const depth = normalizeSpan(params.depth, MIN_OUTER_SPAN);
    return {
      ...params,
      length,
      depth,
      wingLength: normalizeBoundedSpan(
        params.wingLength, MIN_BUILDING_SPAN, length - MIN_VOID_SPAN),
      wingDepth: normalizeBoundedSpan(
        params.wingDepth, MIN_BUILDING_SPAN, depth - MIN_VOID_SPAN)
    };
  },
  validateParams(params) {
    const issues = [];
    validateSpan(params, 'length', MIN_OUTER_SPAN, issues);
    validateSpan(params, 'depth', MIN_OUTER_SPAN, issues);
    validateSpan(params, 'wingLength', MIN_BUILDING_SPAN, issues);
    validateSpan(params, 'wingDepth', MIN_BUILDING_SPAN, issues);
    if (Number.isFinite(params.length) && Number.isFinite(params.wingLength)
      && params.wingLength > params.length - MIN_VOID_SPAN) {
      issues.push('wingLength must leave a visible notch');
    }
    if (Number.isFinite(params.depth) && Number.isFinite(params.wingDepth)
      && params.wingDepth > params.depth - MIN_VOID_SPAN) {
      issues.push('wingDepth must leave a visible notch');
    }
    return issues;
  },
  createFootprint(params) {
    const halfLength = params.length / 2;
    const halfDepth = params.depth / 2;
    return [
      [-halfLength, -halfDepth],
      [halfLength, -halfDepth],
      [halfLength, -halfDepth + params.wingDepth],
      [-halfLength + params.wingLength, -halfDepth + params.wingDepth],
      [-halfLength + params.wingLength, halfDepth],
      [-halfLength, halfDepth]
    ];
  },
  getDimensionControls() {
    return controls;
  }
});
