import * as THREE from 'three';
import { createBuildingGizmo, gizmoCursor, resolveGizmo, rotationFromDrag } from './buildingGizmo.js';
import { createBuildingGizmoOverlay } from './buildingGizmoOverlay.js';
import {
  createBuildingRotationGuide,
  rotationDirectionLabel,
  updateBuildingRotationGuide
} from './buildingRotationGuide.js';
import { resolvePickedEntity, pointerToNdc } from '../picking.js';
import { applyDimensionControl } from '../../domain/buildings/buildingTypes.js';
import { worldPointToBuildingLocal } from '../../domain/buildings/buildingCoordinates.js';
import { createUpdateBuildingCommand } from '../../store/projectCommands.js';

export function selectedBuildingIdForGizmo(view) {
  return view?.phase === 'build' && view.selection?.kind === 'building'
    ? view.selection.id : null;
}

export function outwardLabelOffset(center, pointer, distance = 24) {
  const dx = pointer.x - center.x;
  const dy = pointer.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: Number((pointer.x + dx / length * distance).toFixed(1)),
    y: Number((pointer.y + dy / length * distance).toFixed(1))
  };
}

export function resizeBuildingFromGroundPoint(building, handle, point) {
  return applyDimensionControl({
    templateId: building.template,
    controlId: handle.controlId,
    startParams: building.params,
    pointerLocal: worldPointToBuildingLocal(building, point)
  });
}

export function createBuildingGestures({
  canvas,
  camera,
  scene,
  buildingsGroup,
  store,
  setCameraLocked,
  previewBuilding = () => {},
  clearBuildingPreview = () => {}
}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  const label = document.createElement('div');
  label.className = 'scene-dim-label';
  label.hidden = true;
  canvas.parentElement.append(label);
  const guideCenter = new THREE.Vector3();
  const rotationGuide = createBuildingRotationGuide();
  scene.add(rotationGuide);
  const overlay = createBuildingGizmoOverlay({
    container: canvas.parentElement,
    canvas,
    camera,
    buildingsGroup
  });
  let gizmo = null;
  let project = null;
  let gesture = null;
  let suppressClick = false;

  function raycast(event, objects) {
    const ndc = pointerToNdc(event, canvas.getBoundingClientRect());
    pointer.set(ndc.x, ndc.y);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(objects, true);
  }

  function interactionObjects() {
    return [...(gizmo?.children ?? []), ...buildingsGroup.children];
  }

  function updateCursor(event) {
    if (project?.view?.phase !== 'build' || project.view.roomEditing) {
      canvas.style.cursor = '';
      return;
    }
    const intersections = raycast(event, interactionObjects());
    const handle = resolveGizmo(intersections);
    const picked = resolvePickedEntity(intersections);
    const pickedId = typeof picked === 'string' ? picked : picked?.kind === 'building' ? picked.id : null;
    const hoverTarget = handle ?? (project.buildings.some(building => building.id === pickedId)
      ? { type: 'move' } : null);
    canvas.style.cursor = gizmoCursor(hoverTarget);
  }

  function groundPoint(event) {
    raycast(event, []);
    return raycaster.ray.intersectPlane(ground, hitPoint) ? { x: hitPoint.x, z: hitPoint.z } : null;
  }

  function buildingObject(id) {
    return buildingsGroup.children.find(child => child.userData?.entityId === id) ?? null;
  }

  function nearestDistance(buildingId, position, building) {
    let nearest = Infinity;
    const radius = Math.hypot(building.params.length, building.params.depth) / 2;
    for (const other of project?.buildings ?? []) {
      if (other.id === buildingId) continue;
      const otherRadius = Math.hypot(other.params.length, other.params.depth) / 2;
      nearest = Math.min(nearest, Math.max(0, Math.hypot(position.x - other.position.x, position.z - other.position.z) - radius - otherRadius));
    }
    return Number.isFinite(nearest) ? nearest : null;
  }

  function start(event) {
    if (project?.view?.phase !== 'build' || project.view.roomEditing) return;
    const intersections = raycast(event, interactionObjects());
    const handle = resolveGizmo(intersections);
    const picked = resolvePickedEntity(intersections);
    const buildingId = handle?.buildingId ?? (typeof picked === 'string' ? picked : picked?.kind === 'building' ? picked.id : null);
    const building = project?.buildings.find(item => item.id === buildingId);
    const point = groundPoint(event);
    if (!building || !point) return;
    gesture = {
      pointerId: event.pointerId, building, handle: handle ?? { type: 'move' },
      start: point, current: point, object: buildingObject(buildingId), moved: false,
      value: null
    };
    canvas.setPointerCapture?.(event.pointerId);
    setCameraLocked(true);
    canvas.style.cursor = gizmoCursor(gesture.handle, true);
    event.preventDefault();
  }

  function move(event) {
    if (!gesture) {
      updateCursor(event);
      return;
    }
    if (event.pointerId !== gesture.pointerId) return;
    canvas.style.cursor = gizmoCursor(gesture.handle, true);
    const point = groundPoint(event);
    if (!point) return;
    gesture.current = point;
    gesture.moved ||= Math.hypot(point.x - gesture.start.x, point.z - gesture.start.z) > 0.08;
    const { building, handle, object } = gesture;
    if (handle.type === 'move') {
      const position = {
        x: building.position.x + point.x - gesture.start.x,
        z: building.position.z + point.z - gesture.start.z
      };
      gesture.value = { position };
      if (object) object.position.set(position.x, 0, position.z);
      const distance = nearestDistance(building.id, position, building);
      label.textContent = distance == null ? '移动建筑' : `距最近建筑 ${distance.toFixed(1)} 米`;
    } else if (handle.type === 'rotate') {
      const rotation = rotationFromDrag(building, gesture.start, point);
      gesture.value = { rotation };
      if (object) object.rotation.y = THREE.MathUtils.degToRad(rotation);
      updateBuildingRotationGuide(rotationGuide, building.position, point);
      label.textContent = rotationDirectionLabel(building.position, point);
    } else {
      const params = resizeBuildingFromGroundPoint(building, handle, point);
      gesture.value = { params };
      previewBuilding({ ...building, params });
      const changedField = Object.keys(params).find(field =>
        Number.isFinite(params[field]) && params[field] !== building.params[field]);
      label.textContent = changedField
        ? `${params[changedField].toFixed(1)} 米`
        : '调整建筑尺寸';
    }
    const rect = canvas.getBoundingClientRect();
    if (handle.type === 'rotate') {
      guideCenter.set(building.position.x, 0.72, building.position.z).project(camera);
      const center = {
        x: (guideCenter.x * 0.5 + 0.5) * rect.width,
        y: (-guideCenter.y * 0.5 + 0.5) * rect.height
      };
      const position = outwardLabelOffset(center, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      });
      label.style.left = `${position.x}px`;
      label.style.top = `${position.y}px`;
    } else {
      label.style.left = `${event.clientX - rect.left}px`;
      label.style.top = `${event.clientY - rect.top}px`;
    }
    label.hidden = false;
  }

  function finish(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const completed = gesture;
    gesture = null;
    label.hidden = true;
    rotationGuide.visible = false;
    setCameraLocked(false);
    canvas.releasePointerCapture?.(event.pointerId);
    canvas.style.cursor = event.type === 'pointercancel' ? '' : gizmoCursor(completed.handle);
    if (completed.handle.type === 'resize') clearBuildingPreview();
    if (completed.moved && completed.value) {
      suppressClick = true;
      const label = completed.value.position ? '移动建筑'
        : completed.value.rotation != null ? '旋转建筑' : '调整建筑尺寸';
      store.execute(createUpdateBuildingCommand(completed.building.id, completed.value, label));
    }
  }

  function leave() {
    if (!gesture) canvas.style.cursor = '';
  }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('pointerleave', leave);

  return {
    updateProject(nextProject) {
      project = nextProject;
      if (gizmo) { scene.remove(gizmo); gizmo.userData.dispose?.(); gizmo = null; }
      const selectedId = selectedBuildingIdForGizmo(nextProject.view);
      const building = nextProject.buildings.find(item => item.id === selectedId);
      if (building && !nextProject.view.roomEditing) {
        gizmo = createBuildingGizmo(building);
        scene.add(gizmo);
      }
      if (gizmo) overlay.setGizmo(gizmo);
      else overlay.clear();
      if (!gesture) rotationGuide.visible = false;
      if (!gizmo && !gesture) canvas.style.cursor = '';
    },
    updateOverlay() {
      overlay.update();
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
      canvas.removeEventListener('pointerleave', leave);
      if (gizmo) { scene.remove(gizmo); gizmo.userData.dispose?.(); }
      rotationGuide.visible = false;
      scene.remove(rotationGuide);
      rotationGuide.userData.dispose?.();
      canvas.style.cursor = '';
      clearBuildingPreview();
      overlay.dispose();
      label.remove();
    }
  };
}
