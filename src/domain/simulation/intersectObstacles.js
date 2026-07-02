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

export function firstObstacleDistance(origin, direction, obstacles, afterDistance = 0) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    const distance = intersectRayAabb(origin, direction, obstacle);
    if (distance != null && distance > afterDistance + EPSILON && distance < nearest) {
      nearest = distance;
    }
  }
  return Number.isFinite(nearest) ? nearest : null;
}
