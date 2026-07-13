import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { edgesFor } from '../../src/scene/buildSegmentMeshes.js';

describe('edgesFor', () => {
  it('剔除共面三角形之间的对角线（即便共位顶点的 normal/color 不一致）', () => {
    // 两个共面三角形拼成 xy 平面上的单位正方形，顶点故意不共享（重复写出）。
    const positions = new Float32Array([
      0, 0, 0,  1, 0, 0,  1, 1, 0,   // 三角形 A
      0, 0, 0,  1, 1, 0,  0, 1, 0    // 三角形 B（与 A 共享对角线 (0,0)-(1,1)）
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // 模拟 CSG 输出：同一位置的顶点带互不相同的 normal 与 color。全属性比较的
    // mergeVertices 会因此拒绝合并 → 对角线漏画；edgesFor 必须只按 position 焊接。
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array([
      0, 0, 1,  0, 0, 1,  0.01, 0, 1,
      0, 0.02, 1,  0.03, 0, 1,  0, 0, 1
    ]), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array([
      1, 0, 0,  0, 1, 0,  0, 0, 1,
      0.5, 0.5, 0.5,  0.2, 0.2, 0.2,  0.9, 0.1, 0.1
    ]), 3));

    const lines = edgesFor(geo);
    const segCount = lines.geometry.getAttribute('position').count / 2;
    expect(segCount).toBe(4); // 只剩正方形四条外边，无对角线
  });
});
