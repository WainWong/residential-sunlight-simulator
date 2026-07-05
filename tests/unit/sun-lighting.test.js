import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applySunLighting } from '../../src/scene/sunLighting.js';

describe('sun lighting', () => {
  it('positions a visible shadow-casting light from solar direction', () => {
    const light = new THREE.DirectionalLight();
    applySunLighting(light, {
      aboveHorizon: true,
      altitudeDeg: 32,
      direction: { x: 0.4, y: 0.8, z: -0.2 }
    });

    expect(light.visible).toBe(true);
    expect(light.castShadow).toBe(true);
    expect(light.position.length()).toBeCloseTo(180);
    expect(light.position.x).toBeGreaterThan(0);
  });

  it('turns direct light and shadows off below the horizon', () => {
    const light = new THREE.DirectionalLight();
    applySunLighting(light, {
      aboveHorizon: false,
      altitudeDeg: -4,
      direction: { x: 0, y: -0.1, z: 1 }
    });

    expect(light.visible).toBe(false);
    expect(light.castShadow).toBe(false);
  });
});
