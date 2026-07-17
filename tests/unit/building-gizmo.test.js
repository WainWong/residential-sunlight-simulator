import { describe, expect, it } from 'vitest';
import {
  createBuildingGizmo,
  gizmoCursor,
  resolveGizmo,
  rotationFromDrag,
  rotationFromPointer
} from '../../src/scene/gizmos/buildingGizmo.js';
import { selectedBuildingIdForGizmo } from '../../src/scene/gizmos/createBuildingGestures.js';

describe('building gizmo math', () => {
  it('shows building handles only for a building selection', () => {
    expect(selectedBuildingIdForGizmo({ phase: 'building', selection: { kind: 'building', id: 'b1' } })).toBe('b1');
    expect(selectedBuildingIdForGizmo({ phase: 'building', selection: { kind: 'opening', id: 'o1', buildingId: 'b1' } })).toBeNull();
    expect(selectedBuildingIdForGizmo({ phase: 'sunlight', selection: { kind: 'building', id: 'b1' } })).toBeNull();
  });

  it('computes continuous clockwise rotation from the building centre', () => {
    expect(rotationFromPointer({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(0);
    expect(rotationFromPointer({ x: 0, z: 0 }, { x: 0, z: -1 })).toBeCloseTo(90);
    expect(rotationFromPointer({ x: 0, z: 0 }, { x: -1, z: 1 })).toBeCloseTo(225);
  });

  it('preserves the building angle when a rotation drag has not moved', () => {
    const building = {
      position: { x: 0, z: 0 },
      rotation: 37
    };
    const point = { x: -1, z: 1 };

    expect(rotationFromDrag(building, point, point)).toBeCloseTo(37);
  });

  it('applies the pointer angular delta instead of snapping to its direction', () => {
    const building = {
      position: { x: 0, z: 0 },
      rotation: 30
    };

    expect(rotationFromDrag(
      building,
      { x: 1, z: 0 },
      { x: 0, z: -1 }
    )).toBeCloseTo(120);
  });

  it('keeps rotation continuous across the pointer-angle wraparound', () => {
    const building = {
      position: { x: 0, z: 0 },
      rotation: 30
    };
    const degreesToPoint = degrees => {
      const radians = degrees * Math.PI / 180;
      return { x: Math.cos(radians), z: -Math.sin(radians) };
    };

    expect(rotationFromDrag(
      building,
      degreesToPoint(350),
      degreesToPoint(10)
    )).toBeCloseTo(50);
  });

  it('keeps four external resize anchors with forgiving hit targets', () => {
    const gizmo = createBuildingGizmo({
      id: 'b1',
      position: { x: 0, z: 0 },
      template: 'bar',
      rotation: 0,
      params: { length: 20, depth: 8 }
    });
    const nodes = [];
    gizmo.traverse(node => nodes.push(node));
    const anchors = nodes.filter(node => node.userData.kind === 'building-resize-overlay-anchor');
    const hitTargets = nodes.filter(node => node.userData.kind === 'building-resize-hit-target');

    expect(anchors).toHaveLength(4);
    expect(hitTargets).toHaveLength(4);
    expect(anchors.filter(anchor => anchor.userData.axis === 'x')
      .every(anchor => Math.abs(anchor.position.x) > 10)).toBe(true);
    expect(anchors.filter(anchor => anchor.userData.axis === 'z')
      .every(anchor => Math.abs(anchor.position.z) > 4)).toBe(true);
    expect(Math.min(...hitTargets.map(node => node.geometry.parameters.width))).toBeGreaterThanOrEqual(4);

    gizmo.userData.dispose();
  });

  it('creates eight overlay anchors with matching transparent hit targets', () => {
    const gizmo = createBuildingGizmo({
      id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
      template: 'bar',
      params: { length: 60, depth: 18 }
    });
    const nodes = [];
    gizmo.traverse(node => nodes.push(node));
    const rotationAnchors = nodes.filter(node => node.userData.kind === 'building-rotation-overlay-anchor');
    const resizeAnchors = nodes.filter(node => node.userData.kind === 'building-resize-overlay-anchor');

    expect(rotationAnchors).toHaveLength(4);
    expect(resizeAnchors).toHaveLength(4);
    expect(resizeAnchors.filter(node => node.userData.axis === 'x')).toHaveLength(2);
    expect(resizeAnchors.filter(node => node.userData.axis === 'z')).toHaveLength(2);
    expect(nodes.filter(node => node.userData.kind === 'building-rotation-marker-hit-target')).toHaveLength(4);
    expect(nodes.filter(node => node.userData.kind === 'building-resize-hit-target')).toHaveLength(4);
    expect(nodes.some(node => node.userData.kind === 'building-rotation-marker-arc')).toBe(false);
    expect(nodes.some(node => node.userData.kind === 'building-resize-grip')).toBe(false);

    gizmo.userData.dispose();
  });

  it('keeps rotation anchors separated from resize anchors', () => {
    const gizmo = createBuildingGizmo({
      id: 'b1',
      position: { x: 0, z: 0 },
      template: 'bar',
      rotation: 0,
      params: { length: 60, depth: 18 }
    });
    const nodes = [];
    gizmo.traverse(node => nodes.push(node));
    const rotationAnchors = nodes.filter(node => node.userData.kind === 'building-rotation-overlay-anchor');
    const resizeAnchors = nodes.filter(node => node.userData.kind === 'building-resize-overlay-anchor');
    const nearest = Math.min(...rotationAnchors.flatMap(marker => resizeAnchors.map(resize => (
      Math.hypot(marker.position.x - resize.position.x, marker.position.z - resize.position.z)
    ))));
    expect(nearest).toBeGreaterThanOrEqual(5);

    gizmo.userData.dispose();
  });

  it('uses the UI gold ring with depth occlusion and stronger grips', () => {
    const gizmo = createBuildingGizmo({
      id: 'b1', position: { x: 0, z: 0 }, rotation: 0,
      template: 'bar',
      params: { length: 60, depth: 18 }
    });
    const nodes = [];
    gizmo.traverse(node => nodes.push(node));
    const ring = nodes.find(node => node.userData.kind === 'building-rotation-ring');

    expect(ring.material.color.getHex()).toBe(0xe7a52d);
    expect(ring.geometry.parameters.tube).toBeCloseTo(0.28);
    expect(ring.material.depthTest).toBe(true);

    gizmo.userData.dispose();
  });

  it('does not resolve a hidden transform target through a nearer building', () => {
    const building = { userData: { entityId: 'b1' }, parent: null };
    const ring = {
      userData: { gizmo: { type: 'rotate', buildingId: 'b1' } }, parent: null
    };
    const resize = {
      userData: { gizmo: { type: 'resize', buildingId: 'b1', axis: 'x', controlId: 'outer-east' } },
      parent: null
    };

    expect(resolveGizmo([{ object: building }, { object: ring }])).toBeNull();
    expect(resolveGizmo([{ object: ring }, { object: building }]))
      .toMatchObject({ type: 'rotate', buildingId: 'b1' });
    expect(resolveGizmo([{ object: building }, { object: resize }])).toBeNull();
  });

  it('maps building gestures to discoverable cursors', () => {
    expect(gizmoCursor({ type: 'move' })).toBe('move');
    expect(gizmoCursor({ type: 'rotate' })).toBe('grab');
    expect(gizmoCursor({ type: 'rotate' }, true)).toBe('grabbing');
    expect(gizmoCursor({ type: 'resize', axis: 'x' })).toBe('ew-resize');
    expect(gizmoCursor({ type: 'resize', axis: 'z' })).toBe('ns-resize');
    expect(gizmoCursor(null)).toBe('');
  });
});

  it.each([
    ['bar', { length: 60, depth: 18 }, 4],
    ['lShape', { length: 60, depth: 40, wingLength: 18, wingDepth: 16 }, 6],
    ['courtyard', {
      length: 60, depth: 40, courtyardLength: 30, courtyardDepth: 16
    }, 8]
  ])('creates type-driven resize controls for %s', (template, params, expectedCount) => {
    const gizmo = createBuildingGizmo({
      id: 'b1', template, position: { x: 0, z: 0 }, rotation: 0, params
    });
    const nodes = [];
    gizmo.traverse(node => nodes.push(node));
    const anchors = nodes.filter(node =>
      node.userData.kind === 'building-resize-overlay-anchor');
    const hitTargets = nodes.filter(node =>
      node.userData.kind === 'building-resize-hit-target');

    expect(anchors).toHaveLength(expectedCount);
    expect(hitTargets).toHaveLength(expectedCount);
    expect(hitTargets.every(node => node.userData.gizmo.controlId)).toBe(true);
    expect(hitTargets.every(node => ['x', 'z'].includes(node.userData.gizmo.axis))).toBe(true);

    gizmo.userData.dispose();
  });

  it('places inner controls toward the empty part of each footprint', () => {
    const lGizmo = createBuildingGizmo({
      id: 'l', template: 'lShape', position: { x: 0, z: 0 }, rotation: 0,
      params: { length: 60, depth: 40, wingLength: 18, wingDepth: 16 }
    });
    const courtyardGizmo = createBuildingGizmo({
      id: 'c', template: 'courtyard', position: { x: 0, z: 0 }, rotation: 0,
      params: { length: 60, depth: 40, courtyardLength: 30, courtyardDepth: 16 }
    });
    const find = (gizmo, id) => gizmo.children.find(node => node.userData.gizmo?.controlId === id);

    expect(find(lGizmo, 'l-inner-vertical').position.x).toBeGreaterThan(-12);
    expect(Math.abs(find(courtyardGizmo, 'courtyard-east').position.x)).toBeLessThan(15);

    lGizmo.userData.dispose();
    courtyardGizmo.userData.dispose();
  });
