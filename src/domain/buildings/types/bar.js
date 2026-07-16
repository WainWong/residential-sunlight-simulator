import {
  createOuterControls,
  MIN_BUILDING_SPAN,
  normalizeSpan,
  rectangle,
  validateSpan
} from './shared.js';

const controls = Object.freeze(createOuterControls());

export const barType = Object.freeze({
  id: 'bar',
  label: '一字型',
  geometryFields: Object.freeze(['length', 'depth']),
  defaults: Object.freeze({ length: 60, depth: 18 }),
  normalizeParams(params) {
    return {
      ...params,
      length: normalizeSpan(params.length, MIN_BUILDING_SPAN),
      depth: normalizeSpan(params.depth, MIN_BUILDING_SPAN)
    };
  },
  validateParams(params) {
    const issues = [];
    validateSpan(params, 'length', MIN_BUILDING_SPAN, issues);
    validateSpan(params, 'depth', MIN_BUILDING_SPAN, issues);
    return issues;
  },
  createFootprint(params) {
    return rectangle(params.length, params.depth);
  },
  getDimensionControls() {
    return controls;
  }
});
