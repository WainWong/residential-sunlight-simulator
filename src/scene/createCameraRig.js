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

  function setTopView(target, height = 120) {
    controls.target.set(target.x, target.y, target.z);
    camera.position.set(target.x, target.y + height, target.z + 0.001);
    camera.lookAt(controls.target);
    controls.update();
  }

  return { camera, controls, resize, setTopView, dispose: () => controls.dispose() };
}
