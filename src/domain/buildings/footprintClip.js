import { createFootprint } from './createFootprint.js';

// Axis-aligned rect helpers (local copies to keep this domain module free of
// scene-layer imports; roomDrag.js has its own erase-oriented subtractRect).

function rectBounds(points) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, z0, x1, z1 };
}

// Subtract axis-aligned rect `cut` from `r`; returns 0–4 axis-aligned rects.
function subtractRect(r, cut) {
  const ax0 = Math.min(r.x0, r.x1), ax1 = Math.max(r.x0, r.x1);
  const az0 = Math.min(r.z0, r.z1), az1 = Math.max(r.z0, r.z1);
  const bx0 = Math.min(cut.x0, cut.x1), bx1 = Math.max(cut.x0, cut.x1);
  const bz0 = Math.min(cut.z0, cut.z1), bz1 = Math.max(cut.z0, cut.z1);
  if (bx1 <= ax0 || bx0 >= ax1 || bz1 <= az0 || bz0 >= az1) return [r];
  const ix0 = Math.max(ax0, bx0), ix1 = Math.min(ax1, bx1);
  const iz0 = Math.max(az0, bz0), iz1 = Math.min(az1, bz1);
  const parts = [];
  if (az0 < iz0) parts.push({ x0: ax0, z0: az0, x1: ax1, z1: iz0 });
  if (iz1 < az1) parts.push({ x0: ax0, z0: iz1, x1: ax1, z1: az1 });
  if (ax0 < ix0) parts.push({ x0: ax0, z0: iz0, x1: ix0, z1: iz1 });
  if (ix1 < ax1) parts.push({ x0: ix1, z0: iz0, x1: ax1, z1: iz1 });
  return parts;
}

function isEmpty(r) {
  return Math.min(r.x0, r.x1) >= Math.max(r.x0, r.x1)
    || Math.min(r.z0, r.z1) >= Math.max(r.z0, r.z1);
}

// Ray-casting point-in-polygon (works for the orthogonal footprints here).
function pointInPolygon([px, pz], ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    const intersect = (zi > pz) !== (zj > pz)
      && px < ((xj - xi) * (pz - zi)) / ((zj - zi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

// Rectangular cells of `bounds` that lie OUTSIDE the orthogonal `ring`
// (i.e. the concave cutouts of an L-shape within its bbox). For a rectangle
// ring (bar template) this is empty.
function complementRects(bounds, ring) {
  const xs = uniqueSorted([...ring.map(p => p[0]), bounds.x0, bounds.x1]);
  const zs = uniqueSorted([...ring.map(p => p[1]), bounds.z0, bounds.z1]);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1], mx = (xa + xb) / 2;
    for (let j = 0; j < zs.length - 1; j++) {
      const za = zs[j], zb = zs[j + 1], mz = (za + zb) / 2;
      if (!pointInPolygon([mx, mz], ring)) {
        out.push({ x0: xa, z0: za, x1: xb, z1: zb });
      }
    }
  }
  return out;
}

// Cutout rects of the footprint relative to its bounding box:
//  - bar: none (rectangle fills its bbox)
//  - lShape: the concave corner
//  - courtyard: the courtyard hole(s)
function footprintCutouts(footprint) {
  if (Array.isArray(footprint)) {
    const bounds = rectBounds(footprint);
    return complementRects(bounds, footprint);
  }
  return (footprint.holes ?? []).map(rectBounds);
}

// Clip an axis-aligned rect (building-local coords) to the building footprint,
// returning 0–N axis-aligned rects that lie inside the slab. Empty result
// means the rect was entirely outside the footprint.
export function clipRectToFootprint(rect, template, params) {
  const footprint = createFootprint(template, params);
  const outer = Array.isArray(footprint) ? footprint : footprint.outer;
  const bounds = rectBounds(outer);

  // Intersect the drawn rect with the footprint bbox first.
  const ix0 = Math.max(Math.min(rect.x0, rect.x1), bounds.x0);
  const ix1 = Math.min(Math.max(rect.x0, rect.x1), bounds.x1);
  const iz0 = Math.max(Math.min(rect.z0, rect.z1), bounds.z0);
  const iz1 = Math.min(Math.max(rect.z0, rect.z1), bounds.z1);
  if (ix0 >= ix1 || iz0 >= iz1) return [];

  let pieces = [{ x0: ix0, z0: iz0, x1: ix1, z1: iz1 }];
  for (const cutout of footprintCutouts(footprint)) {
    pieces = pieces.flatMap(p => subtractRect(p, cutout));
  }
  return pieces.filter(p => !isEmpty(p));
}
