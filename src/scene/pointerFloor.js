import * as THREE from 'three';
import { pointerToNdc } from './picking.js';

// 指针→地面落点 (Pointer Floor)。把一次指针事件投射到某个水平面 y=planeY 上,
// 返回世界坐标 { x, y, z },未命中返回 null。原先 roomDrag、房间手势、建筑手势
// 各自建 raycaster + 平面重复这段。每个 picker 自带 raycaster 与复用向量,平面
// 高度在创建时定死(房间用楼层高、建筑用地面 0)。
export function createFloorPicker({ canvas, camera, planeY = 0 }) {
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  return function pickFloorPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const { x, y } = pointerToNdc(event, rect);
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, y: hit.y, z: hit.z };
  };
}
