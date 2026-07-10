// Hysteresis-based opacity easing for occluding faces. `occluding=true` eases
// opacity down toward `fadeIn`; false eases up toward `restore`. The two
// distinct targets plus per-frame `step` interpolation prevent hard on/off
// flicker when a face sits near the camera↔target sightline boundary.
export function createFadeState({ fadeIn = 0.15, restore = 0.85, step = 0.12 } = {}) {
  return {
    update(current, occluding) {
      const target = occluding ? fadeIn : restore;
      if (current < target) return Math.min(target, current + step);
      if (current > target) return Math.max(target, current - step);
      return target;
    }
  };
}
