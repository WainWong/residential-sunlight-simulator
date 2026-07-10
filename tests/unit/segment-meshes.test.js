import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildSegmentMeshes } from '../../src/scene/buildSegmentMeshes.js';

const material = new THREE.MeshStandardMaterial();
const bar = (areas = []) => ({
  id: 'b1', template: 'bar', rotation: 0, position: { x: 0, z: 0 },
  params: { length: 60, depth: 18, floors: 6, floorHeight: 3 },
  observationAreas: areas
});

function raycast(meshes, origin, dir) {
  const ray = new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize());
  meshes.forEach(m => m.updateMatrixWorld());
  return ray.intersectObjects(meshes, false);
}

describe('buildSegmentMeshes', () => {
  it('no-area building → single segment, zero frames', () => {
    const { meshes, frames } = buildSegmentMeshes(bar(), material);
    expect(meshes).toHaveLength(1);
    expect(frames).toHaveLength(0);
    expect(meshes[0].userData).toMatchObject({ kind: 'building-segment', entityId: 'b1' });
  });

  it('cuts a real hole where the area meets the exterior wall', () => {
    // 区南边贴南墙 z=-9 → 洞;水平射线沿 +z 从楼外指向楼内,穿过洞的高度
    const { meshes } = buildSegmentMeshes(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -9, x1: 8, z1: 0 }] }
    ]), material);
    const hitsThroughHole = raycast(meshes, [0, 4.5, -20], [0, 0, 1]);
    // 首个命中不再是南墙 (z≈-9),而是房间对面的实体(北侧,z≈0 之后)
    expect(hitsThroughHole.length).toBeGreaterThan(0);
    expect(hitsThroughHole[0].point.z).toBeGreaterThan(-1);
    // 洞外(x=20 处南墙完好)仍被墙挡住
    const hitsAtWall = raycast(meshes, [20, 4.5, -20], [0, 0, 1]);
    expect(hitsAtWall[0].point.z).toBeCloseTo(-9, 1);
  });

  it('keeps the floor slab under the room (vertical ray hits slab top)', () => {
    const { meshes } = buildSegmentMeshes(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]), material);
    const hits = raycast(meshes, [0, 5.9, 0], [0, -1, 0]);
    // 房间内部垂直向下:穿过空腔,命中楼板顶 y = 3 + 0.15
    expect(hits[0].point.y).toBeCloseTo(3.15, 2);
  });

  it('ceiling above the room blocks a vertical ray from the sky', () => {
    const { meshes } = buildSegmentMeshes(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]), material);
    const hits = raycast(meshes, [0, 30, 0], [0, -1, 0]);
    // 上段底面(天花板)在 y = 6;首个命中是楼顶 y = 18
    expect(hits[0].point.y).toBeCloseTo(18, 2);
  });

  it('covers a top-floor room with a separate lid mesh (hideable for cutaway)', () => {
    // floor 6 of a 6-floor building: the band is open-topped (no above segment),
    // so a distinct lid mesh seals the room roof and can be hidden on its own.
    const { meshes } = buildSegmentMeshes(bar([
      { id: 'a1', floor: 6, rects: [{ x0: -8, z0: -6, x1: 8, z1: 6 }] }
    ]), material);
    const lid = meshes.find(m => m.userData.kind === 'building-lid');
    expect(lid).toBeTruthy();
    expect(lid.userData.toY).toBeCloseTo(18, 2);
    // 顶盖封住房间:从天空垂直向下,首个命中是顶盖顶面 y=18(不穿透)。
    const hits = raycast(meshes, [0, 30, 0], [0, -1, 0]);
    expect(hits[0].point.y).toBeCloseTo(18, 2);
  });

  it('emits one gold frame per opening edge', () => {
    const { frames } = buildSegmentMeshes(bar([
      { id: 'a1', floor: 2, rects: [{ x0: -8, z0: -9, x1: 8, z1: 0 }] }
    ]), material);
    expect(frames).toHaveLength(1);
    expect(frames[0].userData.kind).toBe('opening-frame');
  });

  it('ring-shaped area keeps its inner island solid', () => {
    // 回形区:外 20×12,内岛 6×4 → 岛屿是实体,垂直射线命中岛顶(band 顶 y=6)
    const { meshes } = buildSegmentMeshes(bar([{
      id: 'a1', floor: 2, rects: [
        { x0: -10, z0: -6, x1: 10, z1: -2 }, { x0: -10, z0: 2, x1: 10, z1: 6 },
        { x0: -10, z0: -2, x1: -3, z1: 2 }, { x0: 3, z0: -2, x1: 10, z1: 2 }
      ]
    }]), material);
    // 只看被挖的 band 段:内岛 (0,0) 上方射线命中岛顶 y=6;空腔 (0,-4) 无命中
    const band = meshes.filter(m => m.userData.hasCutters);
    const island = raycast(band, [0, 10, 0], [0, -1, 0]);
    expect(island[0].point.y).toBeCloseTo(6, 2);
    const cavity = raycast(band, [0, 10, -4], [0, -1, 0]);
    expect(cavity).toHaveLength(0);
  });
});
