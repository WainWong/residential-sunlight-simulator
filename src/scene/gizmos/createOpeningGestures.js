import * as THREE from 'three';
import { worldPointToBuildingLocal } from '../../domain/buildings/buildingCoordinates.js';
import { floorBaseY } from '../../domain/buildings/floorMath.js';
import { rotateLocalToWorld } from '../../domain/buildings/wallGeometry.js';
import { deriveWalls } from '../../domain/walls/deriveWalls.js';
import { createUpdateOpeningCommand } from '../../store/roomCommands.js';
import { pointerToNdc } from '../picking.js';
import {
  createOpeningGizmo,
  openingBoundsFromHandle,
  resolveOpeningHandle
} from './openingGizmo.js';

export function createOpeningGestures({ canvas, camera, scene, store, setCameraLocked }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  const dragPlane = new THREE.Plane();
  const label = document.createElement('div');
  label.className = 'scene-dim-label';
  label.hidden = true;
  canvas.parentElement.append(label);
  let project = null;
  let gizmo = null;
  let gesture = null;
  let suppressClick = false;

  function disposeGizmo() {
    if (!gizmo) return;
    scene.remove(gizmo);
    gizmo.userData.dispose?.();
    gizmo = null;
  }

  function contextFor(openingId, buildingId) {
    const building = project?.buildings.find(item => item.id === buildingId);
    const opening = building?.openings?.find(item => item.id === openingId);
    const wall = opening && deriveWalls(building, opening.floor)
      .find(candidate => candidate.id === opening.wallAnchor?.wallId);
    return building && opening && wall ? { building, opening, wall } : null;
  }

  function rebuildGizmo(context, previewBounds = null) {
    disposeGizmo();
    if (!context || context.opening.status === 'invalid') return;
    gizmo = createOpeningGizmo(
      context.building,
      context.wall,
      previewBounds ? { ...context.opening, bounds: previewBounds } : context.opening
    );
    scene.add(gizmo);
  }

  function raycast(event) {
    if (!gizmo) return [];
    const ndc = pointerToNdc(event, canvas.getBoundingClientRect());
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(gizmo.children, true);
  }

  function setWallPlane(context) {
    const localMid = [
      (context.wall.start[0] + context.wall.end[0]) / 2,
      (context.wall.start[1] + context.wall.end[1]) / 2
    ];
    const [midX, midZ] = rotateLocalToWorld(localMid, context.building.rotation);
    const [normalX, normalZ] = rotateLocalToWorld(context.wall.normal, context.building.rotation);
    const normal = new THREE.Vector3(normalX, 0, normalZ).normalize();
    const point = new THREE.Vector3(
      midX + context.building.position.x,
      floorBaseY({ floor: context.wall.floor, ...context.building.params }),
      midZ + context.building.position.z
    );
    dragPlane.setFromNormalAndCoplanarPoint(normal, point);
  }

  function openingPoint(event, context) {
    const ndc = pointerToNdc(event, canvas.getBoundingClientRect());
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return null;
    const { x: localX, z: localZ } = worldPointToBuildingLocal(context.building, hitPoint);
    const directionX = (context.wall.end[0] - context.wall.start[0]) / context.wall.length;
    const directionZ = (context.wall.end[1] - context.wall.start[1]) / context.wall.length;
    return {
      u: (localX - context.wall.start[0]) * directionX + (localZ - context.wall.start[1]) * directionZ,
      height: hitPoint.y - floorBaseY({ floor: context.wall.floor, ...context.building.params })
    };
  }

  function start(event) {
    const phase = project?.view?.phase;
    if (phase !== 'building' && phase !== 'room') return;
    const handle = resolveOpeningHandle(raycast(event));
    const context = handle && contextFor(handle.openingId, handle.buildingId);
    if (!handle || !context) return;
    setWallPlane(context);
    gesture = {
      pointerId: event.pointerId, handle, context,
      bounds: { ...context.opening.bounds }, valid: true, moved: false
    };
    canvas.setPointerCapture?.(event.pointerId);
    setCameraLocked(true);
    event.preventDefault();
  }

  function move(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const point = openingPoint(event, gesture.context);
    if (!point) return;
    const bounds = openingBoundsFromHandle(
      gesture.context.opening,
      gesture.context.wall,
      gesture.handle.edge,
      point,
      gesture.context.building.params.floorHeight
    );
    const command = createUpdateOpeningCommand(
      gesture.context.building.id,
      gesture.context.opening.id,
      { bounds }
    );
    gesture.bounds = bounds;
    gesture.valid = store.canExecute(command);
    gesture.moved = true;
    rebuildGizmo(gesture.context, bounds);
    label.textContent = `${bounds.width.toFixed(2)} 米 · ${bounds.bottom.toFixed(2)}–${bounds.top.toFixed(2)} 米`;
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
    if (completed.moved) suppressClick = true;
    if (completed.moved && completed.valid) {
      store.execute(createUpdateOpeningCommand(
        completed.context.building.id,
        completed.context.opening.id,
        { bounds: completed.bounds }
      ));
    } else {
      rebuildGizmo(completed.context);
    }
  }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  return {
    updateProject(nextProject) {
      project = nextProject;
      if (gesture) return;
      const selection = nextProject.view.selection;
      rebuildGizmo(selection?.kind === 'opening'
        ? contextFor(selection.id, selection.buildingId)
        : null);
    },
    consumeSuppressedClick() {
      const value = suppressClick;
      suppressClick = false;
      return value;
    },
    dispose() {
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', finish);
      canvas.removeEventListener('pointercancel', finish);
      disposeGizmo();
      label.remove();
    }
  };
}
