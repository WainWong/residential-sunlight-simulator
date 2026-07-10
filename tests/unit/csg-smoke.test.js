import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

describe('three-bvh-csg smoke', () => {
  it('subtracts a box from a box in node', () => {
    const a = new Brush(new THREE.BoxGeometry(4, 4, 4));
    const b = new Brush(new THREE.BoxGeometry(2, 6, 2)); // 贯穿 → 挖出方孔
    a.updateMatrixWorld();
    b.updateMatrixWorld();
    const result = new Evaluator().evaluate(a, b, SUBTRACTION);
    const pos = result.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    // 方孔贯穿 → 从孔正上方垂直向下的射线不命中任何面
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    result.updateMatrixWorld();
    const hits = ray.intersectObject(result, false);
    expect(hits.length).toBe(0);
  });
});
