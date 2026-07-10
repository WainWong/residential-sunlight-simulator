// 把 domain 层的分段规格执行成真实网格:每段一个拉伸体,有刀的段用
// three-bvh-csg 做减法(真挖洞/掏房间)。刀已在 domain 层消除共面
// (洞边外扩);这里再让刀的 y 区间超出段端面,保证上下端面也无共面布尔。
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { buildSegmentSpecs, SLAB_THICKNESS } from '../domain/buildings/segmentBuilding.js';
import { createFootprint } from '../domain/buildings/createFootprint.js';
import { totalBuildingHeight } from '../domain/buildings/floorMath.js';
import { getOuterRing } from './buildingSceneHelpers.js';

const CUT_Y_OVERSHOOT = 0.5;
const EPS = 1e-4;

const openingFrameMaterial = new THREE.LineBasicMaterial({
  color: 0xf1b746, transparent: true, opacity: 0.95
});

function ringToShape(target, ring, toXY) {
  ring.forEach((p, i) => {
    const [x, y] = toXY(p);
    if (i === 0) target.moveTo(x, y); else target.lineTo(x, y);
  });
  target.closePath();
}

function footprintShape(footprint) {
  const shape = new THREE.Shape();
  ringToShape(shape, getOuterRing(footprint), ([x, z]) => [x, -z]);
  for (const hole of Array.isArray(footprint) ? [] : footprint.holes) {
    const path = new THREE.Path();
    ringToShape(path, hole, ([x, z]) => [x, -z]);
    shape.holes.push(path);
  }
  return shape;
}

function cutterShape(cutter) {
  const shape = new THREE.Shape();
  ringToShape(shape, cutter.outer, p => [p.x, -p.z]);
  for (const hole of cutter.holes ?? []) {
    const path = new THREE.Path();
    ringToShape(path, hole, p => [p.x, -p.z]);
    shape.holes.push(path);
  }
  return shape;
}

function extrudeY(shape, fromY, toY) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: toY - fromY, steps: 1, bevelEnabled: false
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, fromY, 0);
  return geometry;
}

function segmentGeometry(spec, footprint, totalH) {
  const shell = extrudeY(footprintShape(footprint), spec.fromY, spec.toY);
  if (spec.cutters.length === 0) return shell;
  const evaluator = new Evaluator();
  let brush = new Brush(shell);
  brush.updateMatrixWorld();
  // 顶层观察层没有上方段兜底,刀若外扩穿顶就把屋顶挖穿了 → 留一层屋顶板
  // (刀顶停在段顶下方 SLAB_THICKNESS 处;此处是刀与实体的真切割面,不共面)。
  const atRoof = Math.abs(spec.toY - totalH) < EPS;
  const knifeTop = atRoof ? spec.toY - SLAB_THICKNESS : spec.toY + CUT_Y_OVERSHOOT;
  for (const cutter of spec.cutters) {
    // 刀 y 区间下端超出段底 CUT_Y_OVERSHOOT:段外没有材料,多切的是空气,
    // 但消除了刀底面与段底面的共面分类。顶端见上。
    const knife = new Brush(extrudeY(
      cutterShape(cutter), spec.fromY - CUT_Y_OVERSHOOT, knifeTop
    ));
    knife.updateMatrixWorld();
    const next = evaluator.evaluate(brush, knife, SUBTRACTION);
    brush.geometry.dispose();
    knife.geometry.dispose();
    brush = next;
    brush.updateMatrixWorld();
  }
  const geometry = brush.geometry;
  geometry.computeVertexNormals();
  return geometry;
}

// 洞口描边:贴在墙面原位的金色线框,位置来自外凸前的原始贴墙边。
function frameForEdge(edge, fromY, toY) {
  const { a, b } = edge;
  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, fromY + 0.02, a.z),
      new THREE.Vector3(b.x, fromY + 0.02, b.z),
      new THREE.Vector3(b.x, toY - 0.02, b.z),
      new THREE.Vector3(a.x, toY - 0.02, a.z)
    ]),
    openingFrameMaterial
  );
  frame.userData.kind = 'opening-frame';
  return frame;
}

export function buildSegmentMeshes(building, material) {
  const specs = buildSegmentSpecs(building);
  const footprint = createFootprint(building.template, building.params);
  const totalH = totalBuildingHeight(building.params);
  const meshes = [];
  const frames = [];
  for (const spec of specs) {
    const mesh = new THREE.Mesh(segmentGeometry(spec, footprint, totalH), material);
    mesh.userData = {
      kind: 'building-segment', entityId: building.id,
      fromY: spec.fromY, toY: spec.toY, hasCutters: spec.cutters.length > 0
    };
    meshes.push(mesh);
    for (const cutter of spec.cutters) {
      for (const edge of cutter.openingEdges ?? []) {
        frames.push(frameForEdge(edge, spec.fromY, spec.toY));
      }
    }
  }
  return { meshes, frames };
}
