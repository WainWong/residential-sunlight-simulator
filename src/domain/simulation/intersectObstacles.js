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

const PORTAL_PLANE_TOL = 0.05; // meters: hit counts as "at the portal plane"

function pointInRing(px, pz, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1];
    const xj = ring[j][0], zj = ring[j][1];
    if ((zi > pz) !== (zj > pz)
      && px < ((xj - xi) * (pz - zi)) / ((zj - zi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

// Ray vs a horizontal footprint cap at y=cap.y. Solid = inside the outer ring
// and outside every hole ring (courtyard voids let the ray pass).
export function intersectRayCap(origin, direction, cap) {
  if (Math.abs(direction[1]) < EPSILON) return null;
  const distance = (cap.y - origin[1]) / direction[1];
  if (distance <= EPSILON) return null;
  const px = origin[0] + direction[0] * distance;
  const pz = origin[2] + direction[2] * distance;
  const [outer, ...holes] = cap.rings;
  if (!pointInRing(px, pz, outer)) return null;
  for (const hole of holes) if (pointInRing(px, pz, hole)) return null;
  return distance;
}

// Does a world point (an obstacle hit) fall inside one of the portal openings?
// Openings are holes in walls: a wall hit inside a portal lets the ray through.
function pointInsideAPortal(point, portals) {
  for (const portal of portals) {
    const { plane, bounds } = portal;
    const rel = [point[0] - plane.point[0], point[1] - plane.point[1], point[2] - plane.point[2]];
    const off = rel[0] * plane.normal[0] + rel[1] * plane.normal[1] + rel[2] * plane.normal[2];
    if (Math.abs(off) > PORTAL_PLANE_TOL) continue;
    const u = rel[0] * plane.tangent[0] + rel[1] * plane.tangent[1] + rel[2] * plane.tangent[2];
    const v = point[1];
    if (u >= bounds.minU && u <= bounds.maxU && v >= bounds.minV && v <= bounds.maxV) return true;
  }
  return false;
}

// First obstacle hit along the whole ray that is NOT excused by passing
// through a portal opening. Walls stay in the obstacle set (they block light);
// only hits landing inside a portal's bounds are treated as pass-throughs.
export function firstBlockingDistance(origin, direction, obstacles, portals = []) {
  const hits = [];
  for (const obstacle of obstacles) {
    const distance = obstacle.cap
      ? intersectRayCap(origin, direction, obstacle)
      : obstacle.a
        ? intersectRayQuad(origin, direction, obstacle)
        : intersectRayAabb(origin, direction, obstacle);
    if (distance != null) hits.push(distance);
  }
  hits.sort((a, b) => a - b);
  for (const distance of hits) {
    const point = [
      origin[0] + direction[0] * distance,
      origin[1] + direction[1] * distance,
      origin[2] + direction[2] * distance
    ];
    if (!pointInsideAPortal(point, portals)) return distance;
  }
  return null;
}
