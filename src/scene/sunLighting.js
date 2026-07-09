const SUN_DISTANCE = 180;

export function applySunLighting(light, solar, { phase = 'present' } = {}) {
  if (phase === 'edit') {
    light.visible = true;
    light.castShadow = false;
    light.intensity = 2.4;
    light.position.set(60, 120, 40);
    light.target.position.set(0, 0, 0);
    light.target.updateMatrixWorld();
    return;
  }
  if (!solar.aboveHorizon) {
    light.visible = false;
    light.castShadow = false;
    return;
  }
  const { x, y, z } = solar.direction;
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  light.visible = true;
  light.castShadow = true;
  light.intensity = 3.2;
  light.position.set(
    (x / len) * SUN_DISTANCE,
    (y / len) * SUN_DISTANCE,
    (z / len) * SUN_DISTANCE
  );
  light.target.position.set(0, 0, 0);
  light.target.updateMatrixWorld();
  light.shadow.needsUpdate = true;
}
