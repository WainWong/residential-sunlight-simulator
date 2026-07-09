export function cloneRects(rects = []) {
  return rects.map(r => ({ ...r }));
}

export function createAreaEditingSession({ mode, buildingId, area = null, defaults = {} }) {
  return {
    mode,
    buildingId,
    areaId: mode === 'edit' ? area?.id : null,
    floor: area?.floor ?? defaults.floor ?? 1,
    rects: cloneRects(area?.rects ?? defaults.rects ?? []),
    sampleHeight: area?.sampleHeight ?? defaults.sampleHeight ?? 0,
    tool: defaults.tool ?? 'draw'
  };
}

export function rectArea(rects = []) {
  return rects.reduce((sum, r) => sum + Math.abs((r.x1 - r.x0) * (r.z1 - r.z0)), 0);
}

export function areaLabel(_area, index) {
  return `观察区 ${index + 1}`;
}
