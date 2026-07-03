const QUALITY_LEVELS = {
  low: { pixelRatio: 1, shadows: false },
  medium: { pixelRatio: 1.5, shadows: true },
  high: { pixelRatio: 2, shadows: true }
};

export function createQualitySettings(initial = 'medium') {
  let level = initial;
  let previewing = false;
  return {
    get value() {
      const settings = QUALITY_LEVELS[level];
      return previewing ? { ...settings, pixelRatio: 1, shadows: false } : settings;
    },
    setLevel(next) {
      if (!QUALITY_LEVELS[next]) throw new Error(`未知画质：${next}`);
      level = next;
    },
    setPreviewing(value) {
      previewing = Boolean(value);
    }
  };
}
