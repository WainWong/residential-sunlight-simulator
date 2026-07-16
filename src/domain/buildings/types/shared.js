export const MIN_BUILDING_SPAN = 2;
export const MIN_VOID_SPAN = 2;
export const MIN_WALL_THICKNESS = 2;

export const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

export function rectangle(length, depth) {
  const halfLength = length / 2;
  const halfDepth = depth / 2;
  return [
    [-halfLength, -halfDepth],
    [halfLength, -halfDepth],
    [halfLength, halfDepth],
    [-halfLength, halfDepth]
  ];
}

function extentControl(id, parameter, axis, sign, normal, anchorOverride) {
  return Object.freeze({
    id,
    role: parameter === 'length' ? 'outer-length' : 'outer-depth',
    axis,
    sign,
    normal: Object.freeze(normal),
    anchor(params) {
      if (anchorOverride) return anchorOverride(params);
      return axis === 'x'
        ? { x: sign * params.length / 2, z: 0 }
        : { x: 0, z: sign * params.depth / 2 };
    },
    applyDrag({ startParams, pointerLocal }) {
      return {
        [parameter]: Math.max(MIN_BUILDING_SPAN, Math.abs(pointerLocal[axis]) * 2)
      };
    }
  });
}

export function createOuterControls(anchorOverrides = {}) {
  return [
    extentControl('outer-east', 'length', 'x', 1, { x: 1, z: 0 }, anchorOverrides['outer-east']),
    extentControl('outer-west', 'length', 'x', -1, { x: -1, z: 0 }, anchorOverrides['outer-west']),
    extentControl('outer-north', 'depth', 'z', 1, { x: 0, z: 1 }, anchorOverrides['outer-north']),
    extentControl('outer-south', 'depth', 'z', -1, { x: 0, z: -1 }, anchorOverrides['outer-south'])
  ];
}

export function normalizeSpan(value, minimum) {
  return Number.isFinite(value) ? Math.max(minimum, value) : value;
}

export function normalizeBoundedSpan(value, minimum, maximum) {
  return Number.isFinite(value) && Number.isFinite(maximum)
    ? clamp(value, minimum, maximum)
    : value;
}

export function validateSpan(params, field, minimum, issues) {
  const value = params[field];
  if (!Number.isFinite(value)) issues.push(`${field} must be finite`);
  else if (value < minimum) issues.push(`${field} must be at least ${minimum}`);
}
