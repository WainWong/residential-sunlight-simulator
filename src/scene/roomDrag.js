import { worldPointToBuildingLocal } from '../domain/buildings/buildingCoordinates.js';
import { applyRectEdit, mergeRects, normalizeRect } from '../domain/rooms/rectEdit.js';
import { createFloorPicker } from './pointerFloor.js';

export { applyRectEdit, mergeRects, normalizeRect };

const GRID_STEP = 0.1; // meters (10cm) snapping granularity for room drawing.

export function snapToGrid(value, step = GRID_STEP) {
  return Math.round(value / step) * step;
}

// 世界→本地地面坐标 = domain 的反向旋转 + 10cm 网格吸附。旋转数学统一走
// worldPointToBuildingLocal,不再手抄。
export function worldToLocalFloor([wx, wz], building) {
  const { x, z } = worldPointToBuildingLocal(building, { x: wx, z: wz });
  return [snapToGrid(x), snapToGrid(z)];
}

export function createRoomDrag({ canvas, camera, floorY, getBuilding, getMode, onPreview = () => {}, onCommit }) {
  const pickFloorPoint = createFloorPicker({ canvas, camera, planeY: floorY });
  let start = null;

  function localAt(event) {
    const hit = pickFloorPoint(event);
    if (!hit) return null;
    return worldToLocalFloor([hit.x, hit.z], getBuilding());
  }
  function onDown(e) {
    if (e.defaultPrevented || e.button !== 0) return;
    // With no active edit tool the left button orbits the camera, so don't
    // start a draw/erase drag.
    if (!getMode()) return;
    start = localAt(e);
  }
  function onMove(e) {
    if (!start) return;
    const cur = localAt(e);
    onPreview(cur ? normalizeRect(start, cur) : null);
  }
  function onUp(e) {
    if (!start || e.button !== 0) { return; }
    const end = localAt(e);
    if (end) onCommit(normalizeRect(start, end), getMode());
    start = null;
    onPreview(null);
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  return {
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
    }
  };
}
