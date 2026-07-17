import * as THREE from 'three';
import { worldPointToBuildingLocal } from '../../domain/buildings/buildingCoordinates.js';
import { createReplaceRoomRectsCommand } from '../../store/roomCommands.js';
import { pointerToNdc } from '../picking.js';
import { createFloorPicker } from '../pointerFloor.js';
import { createRoomRectGizmo, resolveRoomHandle, roomRectFromHandle } from './roomGizmo.js';

export function createRoomGestures({
  canvas, camera, scene, store, building, floor, floorY, rects,
  onPreview, setCameraLocked
}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickFloorPoint = createFloorPicker({ canvas, camera, planeY: floorY });
  const label = document.createElement('div');
  label.className = 'scene-dim-label';
  label.hidden = true;
  canvas.parentElement.append(label);
  let committedRects = structuredClone(rects);
  let gizmo = null;
  let gesture = null;

  function rebuildGizmo(nextRects) {
    if (gizmo) {
      scene.remove(gizmo);
      gizmo.userData.dispose?.();
    }
    gizmo = createRoomRectGizmo(building, floor, nextRects);
    scene.add(gizmo);
  }

  function raycast(event) {
    const ndc = pointerToNdc(event, canvas.getBoundingClientRect());
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(gizmo?.children ?? [], true);
  }

  function localPoint(event) {
    const hit = pickFloorPoint(event);
    if (!hit) return null;
    return worldPointToBuildingLocal(building, hit);
  }

  function start(event) {
    const handle = resolveRoomHandle(raycast(event));
    const point = handle && localPoint(event);
    if (!handle || !point) return;
    gesture = {
      pointerId: event.pointerId, handle, start: point,
      originalRects: structuredClone(committedRects),
      previewRects: structuredClone(committedRects), valid: true, moved: false
    };
    canvas.setPointerCapture?.(event.pointerId);
    setCameraLocked(true);
    event.preventDefault();
  }

  function move(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const point = localPoint(event);
    if (!point) return;
    const nextRects = structuredClone(gesture.originalRects);
    const original = gesture.originalRects[gesture.handle.rectIndex];
    nextRects[gesture.handle.rectIndex] = roomRectFromHandle(original, gesture.handle, point, gesture.start);
    const command = createReplaceRoomRectsCommand(nextRects);
    gesture.previewRects = nextRects;
    gesture.valid = command.apply(structuredClone(store.getState())) != null;
    gesture.moved = true;
    rebuildGizmo(nextRects);
    onPreview(nextRects, gesture.valid);
    const rect = nextRects[gesture.handle.rectIndex];
    label.textContent = `${Math.abs(rect.x1 - rect.x0).toFixed(2)} × ${Math.abs(rect.z1 - rect.z0).toFixed(2)} 米`;
    label.style.left = `${event.clientX - canvas.getBoundingClientRect().left}px`;
    label.style.top = `${event.clientY - canvas.getBoundingClientRect().top}px`;
    label.style.color = gesture.valid ? '' : '#b43e36';
    label.hidden = false;
  }

  function finish(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const completed = gesture;
    gesture = null;
    label.hidden = true;
    setCameraLocked(false);
    canvas.releasePointerCapture?.(event.pointerId);
    if (completed.moved && completed.valid) {
      store.execute(createReplaceRoomRectsCommand(completed.previewRects));
      committedRects = structuredClone(completed.previewRects);
    }
    rebuildGizmo(committedRects);
    onPreview(committedRects, true);
  }

  rebuildGizmo(committedRects);
  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  return {
    dispose() {
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', finish);
      canvas.removeEventListener('pointercancel', finish);
      if (gizmo) {
        scene.remove(gizmo);
        gizmo.userData.dispose?.();
      }
      label.remove();
    }
  };
}
