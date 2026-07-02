import { addScaled, dot, subtract } from './vector.js';

const EPSILON = 1e-7;

export function intersectOpening(origin, direction, opening) {
  const denominator = dot(direction, opening.plane.normal);
  if (denominator <= EPSILON) return null;

  const distance = dot(
    subtract(opening.plane.point, origin),
    opening.plane.normal
  ) / denominator;
  if (distance <= EPSILON) return null;

  const point = addScaled(origin, direction, distance);
  const fromPlaneOrigin = subtract(point, opening.plane.point);
  const u = dot(fromPlaneOrigin, opening.plane.tangent);
  const v = point[1];
  const { minU, maxU, minV, maxV } = opening.bounds;

  if (u < minU || u > maxU || v < minV || v > maxV) return null;
  return { distance, point, u, v };
}
