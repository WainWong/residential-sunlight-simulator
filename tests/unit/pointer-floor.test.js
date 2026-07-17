import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFloorPicker } from '../../src/scene/pointerFloor.js';

// A camera straight above the origin looking down: the screen center ray hits
// the floor plane at (0, planeY, 0). This pins the raycast contract without a
// live canvas.
function topDownCamera() {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  cam.position.set(0, 50, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
const centerEvent = { clientX: 50, clientY: 50 };

describe('createFloorPicker', () => {
  it('projects the screen-center ray onto the plane at planeY', () => {
    const pick = createFloorPicker({ canvas, camera: topDownCamera(), planeY: 0 });
    const point = pick(centerEvent);
    expect(point.x).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
  });

  it('honours a non-zero plane height', () => {
    const pick = createFloorPicker({ canvas, camera: topDownCamera(), planeY: 7 });
    const point = pick(centerEvent);
    expect(point.y).toBeCloseTo(7);
  });

  it('returns null when the ray never crosses the plane', () => {
    // Camera below the floor looking further down never hits y=100 above it.
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    cam.position.set(0, 0, 0);
    cam.lookAt(0, -10, 0);
    cam.updateMatrixWorld();
    const pick = createFloorPicker({ canvas, camera: cam, planeY: 100 });
    expect(pick(centerEvent)).toBeNull();
  });
});
