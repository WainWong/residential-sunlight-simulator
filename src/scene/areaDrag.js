import * as THREE from 'three';

const DEG = Math.PI / 180;

export function worldToLocalFloor([wx, wz], building) {
  const dx = wx - building.position.x;
  const dz = wz - building.position.z;
  const t = building.rotation * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  // inverse of rotateLocalToWorld's rotation matrix is its transpose
  return [dx * c - dz * s, dx * s + dz * c];
}

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

export function applyRectEdit(rects, rect, mode) {
  if (mode === 'erase') return rects.flatMap(r => subtractRect(r, rect));
  return [...rects, rect];
}

export function createAreaDrag({ canvas, camera, floorY, getBuilding, getMode, onCommit }) {
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let start = null;

  function localAt(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return worldToLocalFloor([hit.x, hit.z], getBuilding());
  }
  function onDown(e) { if (getMode() === 'move') return; start = localAt(e); }
  function onUp(e) {
    if (!start || getMode() === 'move') { start = null; return; }
    const end = localAt(e);
    if (end) onCommit(normalizeRect(start, end), getMode());
    start = null;
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  return { dispose() { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); } };
}
