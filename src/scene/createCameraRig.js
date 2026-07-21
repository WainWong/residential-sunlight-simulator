import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createCameraRig(canvas, aspect = 1) {
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 1200);
  camera.position.set(86, 72, 110);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.screenSpacePanning = true;
  controls.minDistance = 1.5;
  controls.maxDistance = 500;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 18, 0);

  // 全局操作模型:左键=仅选择/绘制(交给场景自己的指针监听,OrbitControls 不占用
  // 左键)、右键=旋转、中键=平移、Shift+左键=平移(触摸板/无中键后备)、滚轮=缩放。
  // 触摸端:单指旋转、双指缩放/平移。右键旋转需在 canvas 上屏蔽浏览器右键菜单。
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.update();

  // Shift 按住时,左键临时改为平移(无中键的触摸板后备);松开还原为"不占用"。
  const onModifier = event => {
    controls.mouseButtons.LEFT = event.shiftKey ? THREE.MOUSE.PAN : -1;
  };
  window.addEventListener('keydown', onModifier);
  window.addEventListener('keyup', onModifier);
  // 右键用于旋转 → 屏蔽 canvas 的浏览器右键菜单,否则每次旋转都会弹出菜单。
  const onContextMenu = event => event.preventDefault();
  canvas.addEventListener('contextmenu', onContextMenu);

  function resize(width, height) {
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  // 保留此 API 供手势子系统调用,但在新操作模型下左键本就不归 OrbitControls,
  // 无需再按工具锁旋转 —— 右键始终可旋转。仅保证控件处于启用态。
  function setEditControls() {
    controls.enabled = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
  }

  // Smoothly frame a floor for room editing: animate to an oblique (~40°) pose
  // rather than snapping to a near-top-down view, so the user keeps a sense of
  // orientation and depth. Control mode (orbit vs draw-lock) is owned by the
  // caller — this only moves the camera and never touches setEditControls, so it
  // won't fight a draw tool that engages mid-flight. A new call cancels the
  // previous flight.
  let floorFlightId = 0;
  function focusFloor({ center, radius }, { pitch = THREE.MathUtils.degToRad(40), durationMs = 500 } = {}) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = Math.max(12, (radius / Math.sin(fov / 2)) * 1.25);
    const target = new THREE.Vector3(center.x, center.y, center.z);
    const dest = new THREE.Vector3(
      center.x,
      center.y + Math.sin(pitch) * dist,
      center.z + Math.cos(pitch) * dist
    );
    const fromPos = camera.position.clone();
    const fromTgt = controls.target.clone();
    const start = performance.now();
    const id = ++floorFlightId;
    function tick(now) {
      if (id !== floorFlightId) return; // superseded by a newer focus
      const t = Math.min(1, (now - start) / durationMs);
      const e = t * t * (3 - 2 * t); // smoothstep
      camera.position.lerpVectors(fromPos, dest, e);
      controls.target.lerpVectors(fromTgt, target, e);
      controls.update();
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function focusWall({ position, target }) {
    camera.position.set(position.x, position.y, position.z);
    controls.target.set(target.x, target.y, target.z);
    controls.enabled = true;
    setEditControls(null);
    controls.update();
  }

  // Animate the camera to an oblique overhead framing of a room, then hand
  // control back to OrbitControls so the user inspects it with the same
  // orbit/zoom as the editor. `radius` is the room's half-extent.
  function flyToArea({ center, radius }, { pitch = Math.PI / 4, durationMs = 600 } = {}) {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = Math.max(12, (radius / Math.sin(fov / 2)) * 1.4);
    const target = new THREE.Vector3(center.x, center.y, center.z);
    const horiz = Math.cos(pitch) * dist;
    const dest = new THREE.Vector3(center.x, center.y + Math.sin(pitch) * dist, center.z + horiz);
    const fromPos = camera.position.clone();
    const fromTgt = controls.target.clone();
    const start = performance.now();
    controls.enabled = false;
    function tick(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const e = t * t * (3 - 2 * t); // smoothstep
      camera.position.lerpVectors(fromPos, dest, e);
      controls.target.lerpVectors(fromTgt, target, e);
      controls.update();
      if (t < 1) requestAnimationFrame(tick);
      else { controls.enabled = true; setEditControls(null); }
    }
    requestAnimationFrame(tick);
  }

  return {
    camera, controls, resize, setEditControls, focusFloor, focusWall, flyToArea,
    dispose: () => {
      window.removeEventListener('keydown', onModifier);
      window.removeEventListener('keyup', onModifier);
      canvas.removeEventListener('contextmenu', onContextMenu);
      controls.dispose();
    }
  };
}
