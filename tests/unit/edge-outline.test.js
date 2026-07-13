import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildSegmentMeshes } from '../../src/scene/buildSegmentMeshes.js';

// 描边应来自 footprint / 房间多边形(干净、轴对齐),而不是 CSG 网格(有 T 型
// 接点,EdgesGeometry 无法配对共面三角形 → 漏画三角剖分对角线)。故一个含房间
// 的段,其顶面描边只应是「footprint 外环 + 房间环」的轮廓,没有任何对角线。
describe('segment edge outline', () => {
  const material = new THREE.MeshStandardMaterial();
  const building = {
    id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
    params: { length: 15, depth: 20, floors: 2, floorHeight: 4 },
    observationAreas: [{ id: 'a1', floor: 2, rects: [{ x0: -6, z0: -8, x1: 6, z1: 6 }] }]
  };

  it('顶层观察段的顶面描边仅为轮廓(矩形 footprint + 矩形房间 = 8 条),无对角线', () => {
    const { meshes } = buildSegmentMeshes(building, material);
    const seg = meshes.find(m => m.userData.kind === 'building-segment' && m.userData.hasCutters);
    expect(seg).toBeTruthy();
    const edges = seg.children.find(c => c.userData?.kind === 'segment-edges');
    expect(edges).toBeTruthy();

    const p = edges.geometry.getAttribute('position');
    let maxY = -Infinity;
    for (let i = 0; i < p.count; i += 1) maxY = Math.max(maxY, p.getY(i));

    let topEdges = 0;
    let diagonal = 0;
    for (let i = 0; i < p.count; i += 2) {
      const y0 = p.getY(i), y1 = p.getY(i + 1);
      if (Math.abs(y0 - maxY) < 1e-3 && Math.abs(y1 - maxY) < 1e-3) {
        topEdges += 1;
        const dx = Math.abs(p.getX(i) - p.getX(i + 1));
        const dz = Math.abs(p.getZ(i) - p.getZ(i + 1));
        if (dx > 1e-3 && dz > 1e-3) diagonal += 1; // 既不水平也不竖直 → 对角线
      }
    }
    expect(diagonal).toBe(0);
    expect(topEdges).toBe(8); // footprint 矩形 4 条 + 房间矩形 4 条
  });
});
