// Pure axis-aligned rectangle set editing: add (union) or erase (subtract) a
// rect from a list, keeping the result as a minimal set of merged rects. Shared
// by the scene draw/erase drag and the room commands so drawing and erasing use
// the exact same geometry. No DOM, Three.js, or store dependencies.

export function normalizeRect(p0, p1) {
  return { x0: p0[0], z0: p0[1], x1: p1[0], z1: p1[1] };
}

function xmin(r) { return Math.min(r.x0, r.x1); }
function xmax(r) { return Math.max(r.x0, r.x1); }
function zmin(r) { return Math.min(r.z0, r.z1); }
function zmax(r) { return Math.max(r.z0, r.z1); }

function subtractRect(r, cut) {
  const ax0 = xmin(r), ax1 = xmax(r), az0 = zmin(r), az1 = zmax(r);
  const bx0 = xmin(cut), bx1 = xmax(cut), bz0 = zmin(cut), bz1 = zmax(cut);
  if (bx1 <= ax0 || bx0 >= ax1 || bz1 <= az0 || bz0 >= az1) return [r];
  const ix0 = Math.max(ax0, bx0), ix1 = Math.min(ax1, bx1), iz0 = Math.max(az0, bz0), iz1 = Math.min(az1, bz1);
  const parts = [];
  if (az0 < iz0) parts.push({ x0: ax0, z0: az0, x1: ax1, z1: iz0 });
  if (iz1 < az1) parts.push({ x0: ax0, z0: iz1, x1: ax1, z1: az1 });
  if (ax0 < ix0) parts.push({ x0: ax0, z0: iz0, x1: ix0, z1: iz1 });
  if (ix1 < ax1) parts.push({ x0: ix1, z0: iz0, x1: ax1, z1: iz1 });
  return parts;
}

function norm(r) {
  return { x0: Math.min(r.x0, r.x1), z0: Math.min(r.z0, r.z1), x1: Math.max(r.x0, r.x1), z1: Math.max(r.z0, r.z1) };
}

// Two axis-aligned rects merge into one when they share a full edge and touch
// or overlap along the perpendicular axis.
function tryMerge(a, b) {
  if (a.z0 === b.z0 && a.z1 === b.z1 && a.x1 >= b.x0 && b.x1 >= a.x0) {
    return { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), z0: a.z0, z1: a.z1 };
  }
  if (a.x0 === b.x0 && a.x1 === b.x1 && a.z1 >= b.z0 && b.z1 >= a.z0) {
    return { x0: a.x0, x1: a.x1, z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1) };
  }
  return null;
}

export function mergeRects(input) {
  const rects = input.map(norm);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const merged = tryMerge(rects[i], rects[j]);
        if (merged) {
          rects.splice(j, 1);
          rects[i] = merged;
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return rects;
}

export function applyRectEdit(rects, rect, mode) {
  if (mode === 'erase') return mergeRects(rects.flatMap(r => subtractRect(r, rect)));
  return mergeRects([...rects, rect]);
}
