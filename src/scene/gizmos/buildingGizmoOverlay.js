import * as THREE from 'three';
import { MoveHorizontal, RotateCw } from 'lucide';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ROTATION_ANCHOR = 'building-rotation-overlay-anchor';
const RESIZE_ANCHOR = 'building-resize-overlay-anchor';

function createLucideSvg(iconNode, iconName, className) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-lucide', iconName);
  svg.classList.add(className);
  for (const [tag, attributes] of iconNode) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name !== 'key') child.setAttribute(name, value);
    }
    svg.append(child);
  }
  return svg;
}

function createIconElement(kind) {
  const isRotation = kind === 'rotate';
  const iconNode = isRotation ? RotateCw : MoveHorizontal;
  const iconName = isRotation ? 'rotate-cw' : 'move-horizontal';
  const element = document.createElement('div');
  element.className = `building-gizmo-icon building-gizmo-icon--${kind}`;
  element.dataset.gizmoIcon = kind;
  element.setAttribute('aria-hidden', 'true');
  element.hidden = true;
  element.append(
    createLucideSvg(iconNode, iconName, 'building-gizmo-icon__outline'),
    createLucideSvg(iconNode, iconName, 'building-gizmo-icon__glyph')
  );
  return element;
}

export function createBuildingGizmoOverlay({ container, canvas, camera, buildingsGroup }) {
  const root = document.createElement('div');
  root.className = 'building-gizmo-overlay';
  root.setAttribute('aria-hidden', 'true');
  container.append(root);

  const raycaster = new THREE.Raycaster();
  const worldPoint = new THREE.Vector3();
  const axisPoint = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const toAnchor = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const axisNdc = new THREE.Vector3();
  let items = [];

  function clear() {
    items = [];
    root.replaceChildren();
  }

  function setGizmo(gizmo) {
    clear();
    if (!gizmo) return;
    gizmo.traverse(anchor => {
      const kind = anchor.userData.kind;
      if (kind !== ROTATION_ANCHOR && kind !== RESIZE_ANCHOR) return;
      const iconKind = kind === ROTATION_ANCHOR ? 'rotate' : 'resize';
      const element = createIconElement(iconKind);
      if (anchor.userData.controlId) element.dataset.controlId = anchor.userData.controlId;
      root.append(element);
      items.push({ anchor, element, iconKind });
    });
  }

  function isOccluded(distance) {
    if (!buildingsGroup?.children?.length) return false;
    rayDirection.copy(toAnchor).normalize();
    raycaster.set(cameraPosition, rayDirection);
    const hit = raycaster.intersectObjects(buildingsGroup.children, true)[0];
    return Boolean(hit && hit.distance < distance - 0.05);
  }

  function update() {
    if (!items.length) return;
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offsetX = canvasRect.left - containerRect.left;
    const offsetY = canvasRect.top - containerRect.top;
    camera.getWorldPosition(cameraPosition);
    camera.getWorldDirection(cameraForward);

    for (const item of items) {
      const { anchor, element, iconKind } = item;
      anchor.getWorldPosition(worldPoint);
      toAnchor.copy(worldPoint).sub(cameraPosition);
      const distance = toAnchor.length();
      const hiddenByBuilding = isOccluded(distance);
      if (toAnchor.dot(cameraForward) <= 0 || hiddenByBuilding) {
        element.hidden = true;
        continue;
      }

      ndc.copy(worldPoint).project(camera);
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z < -1 || ndc.z > 1) {
        element.hidden = true;
        continue;
      }

      const x = offsetX + (ndc.x * 0.5 + 0.5) * canvasRect.width;
      const y = offsetY + (-ndc.y * 0.5 + 0.5) * canvasRect.height;
      element.style.left = `${x.toFixed(1)}px`;
      element.style.top = `${y.toFixed(1)}px`;
      element.hidden = false;

      if (iconKind === 'resize') {
        axisPoint.set(anchor.userData.axis === 'x' ? 1 : 0, 0,
          anchor.userData.axis === 'z' ? 1 : 0);
        anchor.localToWorld(axisPoint);
        axisNdc.copy(axisPoint).project(camera);
        const axisX = offsetX + (axisNdc.x * 0.5 + 0.5) * canvasRect.width;
        const axisY = offsetY + (-axisNdc.y * 0.5 + 0.5) * canvasRect.height;
        const angle = Math.atan2(axisY - y, axisX - x) * 180 / Math.PI;
        element.style.setProperty('--gizmo-icon-angle', `${angle.toFixed(1)}deg`);
      } else {
        element.style.setProperty('--gizmo-icon-angle', '0deg');
      }
    }
  }

  function dispose() {
    clear();
    root.remove();
  }

  return {
    setGizmo,
    update,
    clear,
    dispose
  };
}
