import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { edgesFor } from '../../src/scene/buildSegmentMeshes.js';

describe('edgesFor', () => {
  it('剔除共面三角形之间的对角线（焊接未合并顶点后）', () => {
    // 两个共面三角形拼成 xy 平面上的单位正方形，顶点故意不共享（重复写出）。
    const positions = new Float32Array([
      0, 0, 0,  1, 0, 0,  1, 1, 0,   // 三角形 A
      0, 0, 0,  1, 1, 0,  0, 1, 0    // 三角形 B（与 A 共享对角线 (0,0)-(1,1)）
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    const lines = edgesFor(geo);
    const segCount = lines.geometry.getAttribute('position').count / 2;
    expect(segCount).toBe(4); // 只剩正方形四条外边，无对角线
  });
});
