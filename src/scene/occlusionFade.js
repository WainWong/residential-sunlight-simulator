// Hysteresis-based opacity easing for occluding faces. `occluding=true` eases
// opacity down toward `fadeIn`; false eases up toward `restore`. The two
// distinct targets plus per-frame `step` interpolation prevent hard on/off
// flicker when a face sits near the camera↔target sightline boundary. Defaults
// match the interior-view caller: fade sightline-blocking walls to 30%, back to
// fully opaque otherwise.
export function createFadeState({ fadeIn = 0.30, restore = 1.0, step = 0.12 } = {}) {
  return {
    update(current, occluding) {
      const target = occluding ? fadeIn : restore;
      if (current < target) return Math.min(target, current + step);
      if (current > target) return Math.max(target, current - step);
      return target;
    }
  };
}
