// Compute the union of axis-aligned rects as rectilinear polygons
// (each with an outer ring + any holes). Pure geometry, no three.js.

function normalize(rects) {
  return (rects ?? [])
    .map(r => ({
      x0: Math.min(r.x0, r.x1),
      x1: Math.max(r.x0, r.x1),
      z0: Math.min(r.z0, r.z1),
      z1: Math.max(r.z0, r.z1)
    }))
    .filter(r => r.x0 < r.x1 && r.z0 < r.z1);
}

function pointInLoop(px, pz, loop) {
  let inside = false;
  const n = loop.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = loop[i].x, zi = loop[i].z;
    const xj = loop[j].x, zj = loop[j].z;
    const intersect = (zi > pz) !== (zj > pz)
      && px < ((xj - xi) * (pz - zi)) / ((zj - zi) || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function signedArea(loop) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % loop.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
}

export function rectUnionToPolygons(rects) {
  const norm = normalize(rects);
  if (norm.length === 0) return [];

  const xs = [...new Set(norm.flatMap(r => [r.x0, r.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(norm.flatMap(r => [r.z0, r.z1]))].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const nz = zs.length - 1;

  const filled = (i, j) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cz = (zs[j] + zs[j + 1]) / 2;
    return norm.some(r => r.x0 <= cx && cx < r.x1 && r.z0 <= cz && cz < r.z1);
  };

  // Directed boundary edges, oriented CCW around the filled region
  // (so outer loops come out CCW / positive area, holes CW / negative).
  const edges = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (!filled(i, j)) continue;
      if (!filled(i, j - 1)) edges.push({ from: { x: xs[i], z: zs[j] }, to: { x: xs[i + 1], z: zs[j] } });
      if (!filled(i, j + 1)) edges.push({ from: { x: xs[i + 1], z: zs[j + 1] }, to: { x: xs[i], z: zs[j + 1] } });
      if (!filled(i - 1, j)) edges.push({ from: { x: xs[i], z: zs[j + 1] }, to: { x: xs[i], z: zs[j] } });
      if (!filled(i + 1, j)) edges.push({ from: { x: xs[i + 1], z: zs[j] }, to: { x: xs[i + 1], z: zs[j + 1] } });
    }
  }

  const key = p => `${p.x},${p.z}`;
  const fromMap = new Map();
  for (const e of edges) {
    const k = key(e.from);
    if (!fromMap.has(k)) fromMap.set(k, []);
    fromMap.get(k).push(e);
  }

  const used = new Set();
  const loops = [];
  for (const start of edges) {
    if (used.has(start)) continue;
    const loop = [];
    let cur = start;
    while (cur && !used.has(cur)) {
      used.add(cur);
      loop.push(cur.from);
      const nextArr = fromMap.get(key(cur.to)) ?? [];
      cur = nextArr.find(e => !used.has(e)) ?? null;
    }
    if (loop.length >= 3) loops.push(loop);
  }

  const outers = [];
  const holes = [];
  for (const loop of loops) {
    if (signedArea(loop) > 0) outers.push(loop);
    else holes.push(loop);
  }

  // Assign each hole to the (unique) outer that contains it.
  return outers.map(outer => ({
    outer,
    holes: holes.filter(h => pointInLoop(h[0].x + 1e-6, h[0].z + 1e-6, outer))
  }));
}
