// @vitest-environment jsdom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createBuildingGizmo } from '../../src/scene/gizmos/buildingGizmo.js';
import { createBuildingGizmoOverlay } from '../../src/scene/gizmos/buildingGizmoOverlay.js';
import { createBuildingGestures } from '../../src/scene/gizmos/createBuildingGestures.js';

function rect({ left = 0, top = 0, width = 800, height = 600 } = {}) {
  return {
    left, top, width, height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() { return this; }
  };
}

function dispatchPointer(canvas, type, { clientX, clientY, pointerId = 1 }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId }
  });
  canvas.dispatchEvent(event);
}

function setupOverlay() {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  container.append(canvas);
  document.body.replaceChildren(container);
  container.getBoundingClientRect = () => rect({ left: 20, top: 30 });
  canvas.getBoundingClientRect = () => rect({ left: 40, top: 50 });

  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 200);
  camera.position.set(0, 35, 55);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const buildingsGroup = new THREE.Group();
  const overlay = createBuildingGizmoOverlay({ container, canvas, camera, buildingsGroup });
  return { container, canvas, camera, buildingsGroup, overlay };
}

function defaultGizmo() {
  return createBuildingGizmo({
    id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
    template: 'bar',
    params: { length: 60, depth: 18 }
  });
}

function singleAnchor(kind, position, axis = null) {
  const gizmo = new THREE.Group();
  const anchor = new THREE.Object3D();
  anchor.position.copy(position);
  anchor.userData.kind = kind;
  anchor.userData.overlayIcon = kind.includes('rotation') ? 'rotate' : 'resize';
  if (axis) anchor.userData.axis = axis;
  gizmo.add(anchor);
  return { gizmo, anchor };
}

describe('building gizmo DOM overlay', () => {
  it('creates standard Lucide SVG icons for all eight anchors', () => {
    const { container, overlay } = setupOverlay();
    const gizmo = defaultGizmo();

    overlay.setGizmo(gizmo);

    expect(container.querySelectorAll('[data-gizmo-icon="rotate"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-gizmo-icon="resize"]')).toHaveLength(4);
    expect(container.querySelectorAll('svg[data-lucide="rotate-cw"]')).toHaveLength(8);
    expect(container.querySelectorAll('svg[data-lucide="move-horizontal"]')).toHaveLength(8);
    expect(container.querySelectorAll('.building-gizmo-icon__outline')).toHaveLength(8);
    expect(container.querySelectorAll('.building-gizmo-icon__glyph')).toHaveLength(8);

    expect([...container.querySelectorAll('[data-gizmo-icon="resize"]')]
      .map(icon => icon.dataset.controlId)).toEqual([
      'outer-east', 'outer-west', 'outer-north', 'outer-south'
    ]);
    expect(container.querySelectorAll('[data-control-id]')).toHaveLength(4);

    overlay.dispose();
    gizmo.userData.dispose();
  });

  it('projects anchors and rotates resize arrows into their screen direction', () => {
    const { container, overlay } = setupOverlay();
    const gizmo = defaultGizmo();
    overlay.setGizmo(gizmo);

    overlay.update();

    const visibleIcons = [...container.querySelectorAll('[data-gizmo-icon]')]
      .filter(icon => !icon.hidden);
    const resizeIcon = visibleIcons.find(icon => icon.dataset.gizmoIcon === 'resize');
    expect(visibleIcons.length).toBeGreaterThan(0);
    expect(resizeIcon.style.left).toMatch(/px$/);
    expect(resizeIcon.style.top).toMatch(/px$/);
    expect(resizeIcon.style.getPropertyValue('--gizmo-icon-angle')).toMatch(/^-?\d+(\.\d+)?deg$/);

    overlay.dispose();
    gizmo.userData.dispose();
  });

  it('hides anchors behind the camera or outside the canvas', () => {
    const { container, overlay } = setupOverlay();
    const behind = singleAnchor('building-rotation-overlay-anchor', new THREE.Vector3(0, 0, 100));
    overlay.setGizmo(behind.gizmo);
    overlay.update();
    expect(container.querySelector('[data-gizmo-icon]').hidden).toBe(true);

    const outside = singleAnchor('building-rotation-overlay-anchor', new THREE.Vector3(500, 0, 0));
    overlay.setGizmo(outside.gizmo);
    overlay.update();
    expect(container.querySelector('[data-gizmo-icon]').hidden).toBe(true);

    overlay.dispose();
  });

  it('hides an anchor occluded by building geometry', () => {
    const { container, camera, buildingsGroup, overlay } = setupOverlay();
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const blocker = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial()
    );
    blocker.position.z = 10;
    blocker.updateMatrixWorld();
    buildingsGroup.add(blocker);
    const target = singleAnchor('building-rotation-overlay-anchor', new THREE.Vector3(0, 0, 0));
    overlay.setGizmo(target.gizmo);

    overlay.update();

    expect(container.querySelector('[data-gizmo-icon]').hidden).toBe(true);
    blocker.geometry.dispose();
    blocker.material.dispose();
    overlay.dispose();
  });

  it('hides a resize arrow occluded by building geometry', () => {
    const { container, camera, buildingsGroup, overlay } = setupOverlay();
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const blocker = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial()
    );
    blocker.position.z = 10;
    blocker.updateMatrixWorld();
    buildingsGroup.add(blocker);
    const target = singleAnchor(
      'building-resize-overlay-anchor',
      new THREE.Vector3(0, 0, 0),
      'x'
    );
    overlay.setGizmo(target.gizmo);

    overlay.update();

    expect(container.querySelector('[data-gizmo-icon]').hidden).toBe(true);
    blocker.geometry.dispose();
    blocker.material.dispose();
    overlay.dispose();
  });

  it('clears icons and removes its root on disposal', () => {
    const { container, overlay } = setupOverlay();
    const gizmo = defaultGizmo();
    overlay.setGizmo(gizmo);
    expect(container.querySelector('.building-gizmo-overlay')).not.toBeNull();

    overlay.clear();
    expect(container.querySelectorAll('[data-gizmo-icon]')).toHaveLength(0);
    overlay.dispose();
    expect(container.querySelector('.building-gizmo-overlay')).toBeNull();
    gizmo.userData.dispose();
  });

  it('is synchronized and disposed by the building gesture controller', () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.append(canvas);
    document.body.replaceChildren(container);
    const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 200);
    camera.position.set(0, 35, 55);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const scene = new THREE.Scene();
    const buildingsGroup = new THREE.Group();
    const gestures = createBuildingGestures({
      canvas,
      camera,
      scene,
      buildingsGroup,
      store: { execute() {} },
      setCameraLocked() {}
    });

    gestures.updateProject({
      buildings: [{
        id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
        template: 'bar',
        params: { length: 60, depth: 18 }
      }],
      view: {
        phase: 'building', selection: { kind: 'building', id: 'b1' },
        roomEditing: null
      }
    });

    expect(gestures.updateOverlay).toBeTypeOf('function');
    expect(container.querySelectorAll('[data-gizmo-icon]')).toHaveLength(8);
    gestures.dispose();
    expect(container.querySelector('.building-gizmo-overlay')).toBeNull();
  });

  it.each(['pointerup', 'pointercancel'])(
    'clears a sub-threshold resize preview on %s', finishEvent => {
      const container = document.createElement('div');
      const canvas = document.createElement('canvas');
      container.append(canvas);
      document.body.replaceChildren(container);
      const canvasRect = rect({ left: 40, top: 50 });
      container.getBoundingClientRect = () => rect({ left: 20, top: 30 });
      canvas.getBoundingClientRect = () => canvasRect;
      const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 200);
      camera.position.set(0, 35, 55);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      const scene = new THREE.Scene();
      const buildingsGroup = new THREE.Group();
      const previewBuilding = vi.fn();
      const clearBuildingPreview = vi.fn();
      const execute = vi.fn();
      const gestures = createBuildingGestures({
        canvas, camera, scene, buildingsGroup,
        store: { execute },
        setCameraLocked: vi.fn(),
        previewBuilding,
        clearBuildingPreview
      });
      gestures.updateProject({
        buildings: [{
          id: 'b1', template: 'bar', revision: 1,
          position: { x: 0, z: 0 }, rotation: 0,
          params: { length: 60, depth: 18 }
        }],
        view: {
          phase: 'building', selection: { kind: 'building', id: 'b1' },
          roomEditing: null
        }
      });
      scene.updateMatrixWorld(true);
      let hitTarget;
      scene.traverse(node => {
        if (!hitTarget && node.userData.kind === 'building-resize-hit-target') hitTarget = node;
      });
      const projected = hitTarget.getWorldPosition(new THREE.Vector3()).project(camera);
      const point = {
        clientX: canvasRect.left + (projected.x * 0.5 + 0.5) * canvasRect.width,
        clientY: canvasRect.top + (-projected.y * 0.5 + 0.5) * canvasRect.height
      };

      dispatchPointer(canvas, 'pointerdown', point);
      dispatchPointer(canvas, 'pointermove', point);
      dispatchPointer(canvas, finishEvent, point);

      expect(previewBuilding).toHaveBeenCalledTimes(1);
      expect(clearBuildingPreview).toHaveBeenCalledTimes(1);
      expect(execute).not.toHaveBeenCalled();
      gestures.dispose();
    }
  );
});
