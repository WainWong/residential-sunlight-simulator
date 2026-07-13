// 把 domain 层的分段规格执行成真实网格:每段一个拉伸体,有刀的段用
// three-bvh-csg 做减法(真挖洞/掏房间)。刀已在 domain 层消除共面
// (洞边外扩);这里再让刀的 y 区间超出段端面,保证上下端面也无共面布尔。
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

// 硬边描线:给转角、墙厚、洞口一圈深色轮廓,让相邻同色面之间的棱线读得出
// (统一几何是整块实体,少了老几何薄墙的受光差,棱线会糊)。三种视角通用。
const edgeMaterial = new THREE.LineBasicMaterial({
  color: 0x475154, transparent: true, opacity: 0.55
});

// 顶点色按面朝向:水平面(地板/天花板/屋顶)米色,竖直面(墙)保持建筑灰。
// 基础材质用白底 × 顶点色,所以外墙灰度和重构前一致,只是水平面转成米色 ——
// 室内因此能一眼分出地板与墙,内外剖面也不再糊成一坨。
const HORIZONTAL_COLOR = new THREE.Color(0xd8d0bf);
const VERTICAL_COLOR = new THREE.Color(0xa9b2b2);

function paintByOrientation(geometry) {
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i += 1) {
    const c = Math.abs(normal.getY(i)) > 0.7 ? HORIZONTAL_COLOR : VERTICAL_COLOR;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function edgesFor(geometry) {
  const welded = mergeVertices(geometry);
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(welded, 25), edgeMaterial);
  welded.dispose();
  lines.userData.kind = 'segment-edges';
  return lines;
}

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

function segmentGeometry(spec, footprint) {
  const shell = extrudeY(footprintShape(footprint), spec.fromY, spec.toY);
  if (spec.cutters.length === 0) {
    shell.computeVertexNormals();
    paintByOrientation(shell);
    return shell;
  }
  const evaluator = new Evaluator();
  let brush = new Brush(shell);
  brush.updateMatrixWorld();
  for (const cutter of spec.cutters) {
    // 刀 y 区间上下都超出段端面 CUT_Y_OVERSHOOT:观察层永远"开顶"——房间的
    // 顶盖由独立 mesh 提供(见 lidGeometry),以便"揭盖"时整块隐藏。段外无
    // 材料,多切的是空气,同时消除了刀端面与段端面的共面分类。
    const knife = new Brush(extrudeY(
      cutterShape(cutter), spec.fromY - CUT_Y_OVERSHOOT, spec.toY + CUT_Y_OVERSHOOT
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
  paintByOrientation(geometry);
  return geometry;
}

// 顶层房间的顶盖:一块贴着房间轮廓的薄板(厚 SLAB_THICKNESS),独立成 mesh
// 以便相机升高"揭盖"时整块隐藏。非顶层房间的顶盖 = 上方段的底面,不需要它。
function lidGeometry(room, toY) {
  const geometry = extrudeY(cutterShape(room), toY - SLAB_THICKNESS, toY);
  geometry.computeVertexNormals();
  paintByOrientation(geometry);
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
    const geometry = segmentGeometry(spec, footprint);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      kind: 'building-segment', entityId: building.id,
      fromY: spec.fromY, toY: spec.toY, hasCutters: spec.cutters.length > 0
    };
    // 描边作为子对象:随段的变换与可见性走,拾取仍解析到父级 entityId。
    mesh.add(edgesFor(geometry));
    meshes.push(mesh);

    // 顶层房间没有上方段当顶,补一块独立顶盖 mesh(可被"揭盖"整块隐藏)。
    const atRoof = Math.abs(spec.toY - totalH) < EPS;
    if (atRoof) {
      for (const room of spec.rooms ?? []) {
        const lidGeom = lidGeometry(room, spec.toY);
        const lid = new THREE.Mesh(lidGeom, material);
        lid.userData = {
          kind: 'building-lid', entityId: building.id,
          fromY: spec.toY - SLAB_THICKNESS, toY: spec.toY
        };
        lid.add(edgesFor(lidGeom));
        meshes.push(lid);
      }
    }

    for (const cutter of spec.cutters) {
      for (const edge of cutter.openingEdges ?? []) {
        frames.push(frameForEdge(edge, spec.fromY, spec.toY));
      }
    }
  }
  return { meshes, frames };
}
