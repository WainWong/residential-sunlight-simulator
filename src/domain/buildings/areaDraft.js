export function isDraftFor(draft, buildingId, areaId) {
  return Boolean(draft && draft.buildingId === buildingId && draft.areaId === areaId);
}

export function resolveDraftRects(draft, buildingId, areaId, areaRects) {
  return isDraftFor(draft, buildingId, areaId) ? draft.rects : (areaRects ?? []);
}
