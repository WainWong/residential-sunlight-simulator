const EPSILON = 1e-7;

export function intersectRayAabb(origin, direction, obstacle) {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;

  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(direction[axis]) < EPSILON) {
      if (origin[axis] < obstacle.min[axis] || origin[axis] > obstacle.max[axis]) {
        return null;
      }
      continue;
    }

    const inverse = 1 / direction[axis];
    let axisNear = (obstacle.min[axis] - origin[axis]) * inverse;
    let axisFar = (obstacle.max[axis] - origin[axis]) * inverse;
    if (axisNear > axisFar) [axisNear, axisFar] = [axisFar, axisNear];
    near = Math.max(near, axisNear);
    far = Math.min(far, axisFar);
    if (near > far) return null;
  }

  return far > EPSILON ? Math.max(near, 0) : null;
}

function subtractV(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function crossV(a, b) {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function dotV(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

// 矩形 a,b,c,d（a->b 与 a->d 为两邻边）。双面命中。
export function intersectRayQuad(origin, direction, quad) {
  const edgeU = subtractV(quad.b, quad.a);
  const edgeV = subtractV(quad.d, quad.a);
  const normal = crossV(edgeU, edgeV);
  const denom = dotV(direction, normal);
  if (Math.abs(denom) < EPSILON) return null;
  const distance = dotV(subtractV(quad.a, origin), normal) / denom;
  if (distance <= EPSILON) return null;
  const point = [
    origin[0] + direction[0] * distance,
    origin[1] + direction[1] * distance,
    origin[2] + direction[2] * distance
  ];
  const rel = subtractV(point, quad.a);
  const u = dotV(rel, edgeU) / dotV(edgeU, edgeU);
  const v = dotV(rel, edgeV) / dotV(edgeV, edgeV);
  if (u < -EPSILON || u > 1 + EPSILON || v < -EPSILON || v > 1 + EPSILON) return null;
  return distance;
}

export function firstObstacleDistance(origin, direction, obstacles, afterDistance = 0) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    const distance = obstacle.a
      ? intersectRayQuad(origin, direction, obstacle)
      : intersectRayAabb(origin, direction, obstacle);
    if (distance != null && distance > afterDistance + EPSILON && distance < nearest) {
      nearest = distance;
    }
  }
  return Number.isFinite(nearest) ? nearest : null;
}
