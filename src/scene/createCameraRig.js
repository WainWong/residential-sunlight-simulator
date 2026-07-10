import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createCameraRig(canvas, aspect = 1) {
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 1200);
  camera.position.set(86, 72, 110);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.screenSpacePanning = true;
  controls.minDistance = 8;
  controls.maxDistance = 500;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 18, 0);
  controls.update();

  function resize(width, height) {
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  // Configure controls for area editing. An edit tool ('draw'/'erase') reserves
  // left-drag for editing and locks rotation; with no tool selected (null) the
  // user can orbit to inspect orientation. Passing null also restores the
  // normal building-view controls when leaving area editing.
  function setEditControls(tool) {
    controls.enabled = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    if (tool === 'draw' || tool === 'erase') {
      controls.enableRotate = false;
      controls.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      controls.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_PAN };
    } else {
      controls.enableRotate = true;
      controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    }
  }

  return { camera, controls, resize, setEditControls, dispose: () => controls.dispose() };
}
